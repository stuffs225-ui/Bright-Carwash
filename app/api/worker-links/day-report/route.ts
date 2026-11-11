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
  const date=new URL(request.url).searchParams.get("date");
  if(!validDate(date))return deny(400,"تاريخ غير صالح");
  const {data,error}=await access.admin.from("carwash_worker_day_reports").select("*").eq("business_date",date).maybeSingle();
  if(error)return deny(503,"تعذر تحميل تقرير العامل");
  if(!data)return NextResponse.json({report:null},{headers:NO_STORE});
  const signed=await access.admin.storage.from("carwash-pos-evidence").createSignedUrl(data.report_object_path,300);
  if(signed.error)return deny(503,"تعذر فتح صورة التقرير");
  return NextResponse.json({report:{...data,imageUrl:signed.data.signedUrl}},{headers:NO_STORE});
 }catch{return deny(503,"تعذر تحميل التقرير");}
}
export async function POST(request:Request){
 try{
  if(!requestIsSameOrigin(request))return deny(403,"طلب غير مسموح");
  if(Number(request.headers.get("content-length")||0)>4*1024*1024)return deny(413,"الصورة كبيرة؛ اختر صورة أصغر");
  const form=await request.formData();
  const token=form.get("token"),date=form.get("date");
  if(!validCapability(token)||!validDate(date)||!dayIsFinished(date))return deny(400,"الرابط أو تاريخ اليوم غير صالح");
  const cash=money(form.get("cash")),card=money(form.get("card")),terminal=money(form.get("terminal"));
  if([cash,card,terminal].some(n=>!Number.isFinite(n)||n<0||n>10000000))return deny(400,"أدخل الكاش والشبكة وإجمالي تقرير الجهاز");
  const admin=createAdminClient();
  const {data:link,error:linkError}=await admin.from("carwash_worker_links").select("id,created_by,expires_at,revoked_at")
   .eq("token_hash",capabilityHash(token)).maybeSingle();
  if(linkError||!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())return deny(403,"رابط العامل غير نشط");
  const member=await admin.from("app_members").select("active,role").eq("user_id",link.created_by).maybeSingle();
  if(member.error||!member.data?.active||member.data.role!=="manager")return deny(403,"الرابط موقوف");
  const existing=await admin.from("carwash_worker_day_reports").select("business_date").eq("business_date",date).maybeSingle();
  if(existing.error)return deny(503,"تعذر التحقق من التقرير");
  if(existing.data)return NextResponse.json({ok:true,alreadySubmitted:true},{headers:NO_STORE});
  const day=await admin.from("carwash_days").select("status").eq("business_date",date).maybeSingle();
  if(day.error||day.data?.status!=="open")return deny(409,"اليوم غير مفتوح");
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
  const report=await admin.rpc("carwash_submit_worker_day_report",{p_date:date,p_cash:cash,p_card:card,p_terminal:terminal,p_path:path,p_link:link.id});
  if(report.error||report.data!==true){
   // Only remove this request's own unreferenced upload.
   await bucket.remove([path]);
   if(report.error)return deny(409,"تعذر حفظ التقرير؛ تحقق من حالة اليوم");
   return NextResponse.json({ok:true,alreadySubmitted:true},{headers:NO_STORE});
  }
  return NextResponse.json({ok:true},{headers:NO_STORE});
 }catch{return deny(503,"تعذر إرسال الموازنة");}
}
