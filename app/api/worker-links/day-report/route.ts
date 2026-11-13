import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {capabilityHash,validCapability,managerAccess,NO_STORE,requestIsSameOrigin} from "@/lib/carwashCapability";
import {dayIsFinished} from "@/lib/carwashCalendarDay";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const deny=(status:number,error:string)=>NextResponse.json({error},{status,headers:NO_STORE});
const validDate=(d:unknown):d is string=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d));
const money=(s:FormDataEntryValue|null)=>{
 if(typeof s!=="string"||!/^\d{1,8}(\.\d{1,2})?$/.test(s.trim()))return NaN;
 return Number(s);
};
export async function GET(request:Request){
 try{
  const access=await managerAccess(request);
  if(!access)return deny(403,"صلاحية المدير مطلوبة");
  const params=new URL(request.url).searchParams;
  if(params.get("list")==="1"){
   const {data,error}=await access.admin.from("carwash_worker_day_reports")
    .select("business_date").order("business_date",{ascending:false}).limit(120);
   if(error)return deny(503,"تعذر تحميل حالات الموازنة");
   return NextResponse.json({reportedDates:(data||[]).map(r=>r.business_date)},{headers:NO_STORE});
  }
  const date=params.get("date");
  if(!validDate(date))return deny(400,"تاريخ غير صالح");
  const {data,error}=await access.admin.from("carwash_worker_day_reports").select("*").eq("business_date",date).maybeSingle();
  if(error)return deny(503,"تعذر تحميل تقرير العامل");
  if(!data)return NextResponse.json({report:null},{headers:NO_STORE});
  const signed=await access.admin.storage.from("carwash-pos-evidence").createSignedUrl(data.report_object_path,300);
  if(signed.error)return deny(503,"تعذر فتح صورة التقرير");
  const corrections=await access.admin.from("carwash_report_corrections").select("id,version,actual_cash,actual_card,terminal_total,reason,before_values,created_at,created_by").eq("business_date",date).order("version",{ascending:false}).limit(100);
  // Feature detection allows the preview to read the unchanged production schema.
  if(corrections.error&&!['42P01','PGRST205'].includes(corrections.error.code))return deny(503,"تعذر قراءة التصحيحات");
  const latest=corrections.data?.[0];
  return NextResponse.json({report:{...data,...(latest?{actual_cash:latest.actual_cash,actual_card:latest.actual_card,terminal_total:latest.terminal_total}:{}),imageUrl:signed.data.signedUrl},originalReport:{cash:data.actual_cash,card:data.actual_card,terminal:data.terminal_total},corrections:corrections.data||[],correctionsReady:!corrections.error},{headers:NO_STORE});
 }catch{return deny(503,"تعذر تحميل التقرير");}
}
export async function POST(request:Request){
 try{
  if(!requestIsSameOrigin(request))return deny(403,"طلب غير مسموح");
  if(Number(request.headers.get("content-length")||0)>4*1024*1024)return deny(413,"الصورة كبيرة؛ اختر صورة أصغر");
  const form=await request.formData();
  const token=form.get("token"),date=form.get("date");
  if(!validDate(date)||!dayIsFinished(date))return deny(400,"تاريخ اليوم غير صالح");
  const manager=typeof token==="string"&&token?null:await managerAccess(request);
  if(!manager&&!validCapability(token))return deny(403,"صلاحية المدير أو رابط العامل مطلوبة");
  const cash=money(form.get("cash")),card=money(form.get("card")),terminal=money(form.get("terminal"));
  if([cash,card,terminal].some(n=>!Number.isFinite(n)||n<0||n>10000000))return deny(400,"أدخل الكاش والشبكة وإجمالي تقرير الجهاز");
  const admin=createAdminClient();
  let linkId:string|null=null;
  if(!manager){
   if(!validCapability(token))return deny(403,"رابط العامل غير صالح");
   const {data:link,error:linkError}=await admin.from("carwash_worker_links")
    .select("id,created_by,expires_at,revoked_at")
    .eq("token_hash",capabilityHash(token)).maybeSingle();
   if(linkError||!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())
    return deny(403,"رابط العامل غير نشط");
   const member=await admin.from("app_members").select("active,role")
    .eq("user_id",link.created_by).maybeSingle();
   if(member.error||!member.data?.active||member.data.role!=="manager")
    return deny(403,"الرابط موقوف");
   linkId=link.id;
  }
  const existing=await admin.from("carwash_worker_day_reports").select("business_date").eq("business_date",date).maybeSingle();
  if(existing.error)return deny(503,"تعذر التحقق من التقرير");
  if(existing.data)return NextResponse.json({ok:true,alreadySubmitted:true},{headers:NO_STORE});
  const day=await admin.from("carwash_days").select("status").eq("business_date",date).maybeSingle();
  if(day.error||day.data?.status!=="open")return deny(409,"اليوم غير مفتوح");
  const delivery=await admin.rpc("carwash_undelivered_count",{p_date:date});
  if(delivery.error)return deny(503,"تعذر التحقق من تسليم جميع السيارات");
  if(Number(delivery.data)>0)return deny(409,"لا يمكن إرسال الموازنة قبل تسليم جميع السيارات ("+delivery.data+")");
  const file=form.get("photo");
  if(!(file instanceof File)||file.size<=0||file.size>3*1024*1024||
   !["image/jpeg","image/png","image/webp"].includes(file.type))return deny(400,"ارفع صورة JPG أو PNG أو WebP لا تتجاوز 3MB");
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const path="day/"+date+"/"+crypto.randomUUID()+"."+ext;
  const bytes=new Uint8Array(await file.arrayBuffer());
  // Reject mismatched file signatures before writing to private storage.
  if((ext==="jpg"&&!(bytes[0]===255&&bytes[1]===216))||
   (ext==="png"&&!(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71))||
   (ext==="webp"&&!(String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")))
   return deny(400,"صيغة الصورة غير صحيحة");
  const bucket=admin.storage.from("carwash-pos-evidence");
  const up=await bucket.upload(path,bytes,{contentType:file.type,upsert:false});
  if(up.error)return deny(503,"تعذر رفع صورة الموازنة");
  const report=manager
   ?await admin.rpc("carwash_submit_manager_day_report",{
     p_date:date,p_cash:cash,p_card:card,p_terminal:terminal,p_path:path,p_manager:manager.user.id
    })
   :await admin.rpc("carwash_submit_worker_day_report",{
     p_date:date,p_cash:cash,p_card:card,p_terminal:terminal,p_path:path,p_link:linkId
    });
  if(report.error||report.data!==true){
   // Only remove this request's own unreferenced upload.
   if(report.error)return deny(409,"لم يتأكد حفظ التقرير؛ أعد المحاولة للتحقق من وصوله");
   await bucket.remove([path]);
   return NextResponse.json({ok:true,alreadySubmitted:true},{headers:NO_STORE});
  }
  return NextResponse.json({ok:true},{headers:NO_STORE});
 }catch{return deny(503,"تعذر إرسال الموازنة");}
}

export async function PATCH(request:Request){
 try{
  if(!requestIsSameOrigin(request))return deny(403,"طلب غير مسموح");
  const access=await managerAccess(request);if(!access)return deny(403,"صلاحية المدير مطلوبة");
  if(Number(request.headers.get("content-length")||0)>4096)return deny(413,"الطلب كبير");
  const b=await request.json();
  if(!validDate(b.date)||!dayIsFinished(b.date)||typeof b.reason!=="string"||b.reason.trim().length<5||b.reason.length>500||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.requestId||"")||
   [b.cash,b.card,b.terminal].some(n=>typeof n!=="number"||!Number.isFinite(n)||n<0||n>10000000||Math.abs(n*100-Math.round(n*100))>1e-6))
   return deny(400,"راجع قيم التصحيح وسببه");
  const result=await access.admin.rpc("carwash_correct_pending_report",{p_manager:access.user.id,p_day:b.date,p_cash:b.cash,p_card:b.card,p_terminal:b.terminal,p_reason:b.reason.trim(),p_request:b.requestId});
  if(result.error)return deny(409,"لم يتأكد التصحيح؛ قد تكون الموازنة معتمدة أو تحتاج قاعدة البيانات إلى تحديث");
  return NextResponse.json(result.data,{headers:NO_STORE});
 }catch{return deny(503,"تعذر حفظ التصحيح");}
}
