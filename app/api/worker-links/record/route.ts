import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {submissionInServerRiyadhDay} from "@/lib/workerSubmissionClock";
import {acceptsNewRegistrationDiscount} from "@/lib/priceGovernance";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {capabilityHash,validCapability,managerAccess,NO_STORE,requestIsSameOrigin} from "@/lib/carwashCapability";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(status:number,error:string)=>NextResponse.json({error},{status,headers:NO_STORE});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const money=(value:unknown):number|null=>{
 if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>100000||
  Math.abs(Math.round(value*100)-value*100)>0.000001)return null;
 return value;
};
const round=(n:number)=>Math.round(n*100)/100;
type ManualAddon={name:string;price:number};
function normalizeManual(input:unknown):{carType:string;service:string;price:number;
 addons:ManualAddon[];reason:string}|null{
 if(!input||typeof input!=="object")return null;
 const raw=input as Record<string,unknown>;
 if(raw.enabled!==true)return null;
 const carType=typeof raw.carType==="string"?raw.carType.trim():"";
 const service=typeof raw.service==="string"?raw.service.trim():"";
 const reason=typeof raw.reason==="string"?raw.reason.trim():"";
 const price=money(raw.price);
 const list=raw.addons;
 if(carType.length<2||carType.length>80||service.length<2||service.length>80||
  reason.length<3||reason.length>300||price===null||price<=0||price>5000||
  !Array.isArray(list)||list.length>8)return null;
 const addons:ManualAddon[]=[];
 for(const item of list){
  if(!item||typeof item!=="object")return null;
  const x=item as Record<string,unknown>;
  const name=typeof x.name==="string"?x.name.trim():"";
  const amount=money(x.price);
  if(name.length<2||name.length>80||amount===null||amount<=0||amount>5000)
   return null;
  addons.push({name,price:amount});
 }
 return {carType,service,price,addons,reason};
}
export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  if(!requestIsSameOrigin(request))return reply(403,"طلب غير مسموح");
  if(Number(request.headers.get("content-length")||"0")>8192)return reply(400,"طلب كبير جدًا");
  const body=await request.json().catch(()=>null);
  const viaWorker=validCapability(body?.token);
  const isManual=body?.oneTime?.enabled===true;
  const manual=isManual?normalizeManual(body.oneTime):null;
  if(typeof body?.mutationId!=="string"||!uuid.test(body.mutationId)||
    (!isManual&&(typeof body?.presetId!=="string"||!uuid.test(body.presetId)))||
    (isManual&&!manual))return reply(400,"بيانات الخدمة أو السعر الاستثنائي غير صالحة");
  const cash=money(body.cash),card=money(body.card),discount=money(body.discount);
  if(cash===null||card===null||discount===null||cash+card<=0)
   return reply(400,"مبالغ الدفع غير صحيحة");
  if(!acceptsNewRegistrationDiscount(discount))
   return reply(409,"الخصم غير متاح للتسجيلات الجديدة. راجع المدير لتسجيل أي عملية قديمة مؤجلة.");
  const notes=typeof body.notes==="string"?body.notes.trim():"";
  if(notes.length>500)return reply(400,"الملاحظات طويلة جدًا");
  const addons=Array.isArray(body.addons)?body.addons:null;
  if(!addons||addons.length>8||
    addons.some((id:unknown)=>typeof id!=="string"||!uuid.test(id))||
    new Set(addons).size!==addons.length)return reply(400,"الخدمات الإضافية غير صالحة");
  const phone=body.customerPhone===undefined||body.customerPhone===""?null:body.customerPhone;
  if(phone!==null&&(typeof phone!=="string"||!/^\+9665\d{8}$/.test(phone)))
   return reply(400,"رقم العميل غير صالح");
  const whatsappConsent=body.whatsappConsent===true;
  if(whatsappConsent&&!phone)return reply(400,"موافقة العميل ورقم الجوال مطلوبان");

  if(!viaWorker){
   const access=await managerAccess(request);
   if(!access)return reply(403,"صلاحية المدير مطلوبة");
   // Always resolve a known idempotency key before checking new price or date.
   // A previous response can be lost across midnight while the write succeeded.
   const already=await access.admin.from("entries")
    .select("id").eq("created_by",access.user.id)
    .eq("client_mutation_id",body.mutationId).maybeSingle();
   if(already.error)return reply(503,"تعذر فحص تكرار الطلب");
   if(already.data?.id)return NextResponse.json({ok:true,id:already.data.id,duplicate:true},{headers:NO_STORE});
   if(!submissionInServerRiyadhDay(body?.recordedAt,new Date()))
    return reply(409,"التسجيل المحلي من يوم سابق؛ لم يُرحّل لليوم الجديد. اطلب من المدير مراجعته.");
   const {data:limits}=await access.admin.from("settings")
    .select("key,value").eq("key","worker_discount_max").maybeSingle();
   const policyMax=Number(limits?.value??10);
   const allowedDiscount=Number.isFinite(policyMax)?Math.min(Math.max(policyMax,0),5000):10;
   if(discount>allowedDiscount)return reply(409,"الخصم أكبر من الحد المسموح في الإعدادات");
   const {data:preset,error:presetError}=isManual
    ?{data:null,error:null}
    :await access.admin.from("entry_presets")
      .select("car_type,service_type,amount").eq("id",body.presetId).eq("active",true).maybeSingle();
   if(!isManual&&(presetError||!preset))return reply(409,"الخدمة غير متاحة");
   if(manual){
    const {data:carType,error:typeError}=await access.admin.from("car_types")
     .select("name").eq("name",manual.carType).eq("active",true).maybeSingle();
    if(typeError||!carType)return reply(409,"نوع السيارة غير معتمد");
   }
   const extraResult=addons.length?await access.admin.from("carwash_addons")
    .select("id,price").in("id",addons).eq("active",true):
    {data:[] as {id:string;price:number}[],error:null};
   if(extraResult.error||(extraResult.data||[]).length!==addons.length)
    return reply(409,"تغيّرت أسعار الإضافات؛ حدّث القائمة");
   const officialExtras=(extraResult.data||[]).reduce((n,a)=>n+Number(a.price),0);
   const manualExtras=(manual?.addons||[]).reduce((n,a)=>n+a.price,0);
   const base=manual?manual.price:Number(preset?.amount||0);
   if(round(cash+card+discount)!==round(base+officialExtras+manualExtras))
    return reply(409,"المدفوعات لا تطابق الأسعار الفعلية؛ راجع تفاصيل الفاتورة");
   const jwt=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
   const userClient=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+jwt}}
   });
   const {data,error}=await userClient.from("entries").insert({
    car_type:manual?.carType||preset!.car_type,
    service_type:manual?.service||preset!.service_type,
    cash_paid:cash,card_paid:card,discount_amount:discount,
    addon_ids:addons,customer_phone:phone,
    whatsapp_consent:whatsappConsent,sms_consent:false,
    notes:notes||null,occurred_at:new Date().toISOString(),
    created_by:access.user.id,client_mutation_id:body.mutationId,
    one_time_service_name:manual?manual.service:null,
    one_time_base_price:manual?manual.price:null,
    one_time_addons:manual?manual.addons:[],
    one_time_reason:manual?manual.reason:null
   }).select("id").single();
   if(error){
    if(error.code==="23505"){
     const found=await access.admin.from("entries").select("id")
      .eq("created_by",access.user.id).eq("client_mutation_id",body.mutationId).maybeSingle();
     if(found.data?.id)return NextResponse.json({ok:true,id:found.data.id,duplicate:true},{headers:NO_STORE});
    }
    return reply(409,"تعذر تسجيل السيارة: تأكد من السعر وحالة اليوم. "+error.message.slice(0,120));
   }
   return NextResponse.json({ok:true,id:data?.id,duplicate:false},{headers:NO_STORE});
  }

  const admin=createAdminClient();
  if(!submissionInServerRiyadhDay(body?.recordedAt,new Date())){
   const {data:link,error:linkError}=await admin.from("carwash_worker_links")
    .select("id,expires_at,revoked_at,created_by")
    .eq("token_hash",capabilityHash(body.token)).maybeSingle();
   if(linkError||!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())
    return reply(410,"رابط العامل ملغى أو منتهي الصلاحية");
   const {data:owner}=await admin.from("app_members")
    .select("role,active").eq("user_id",link.created_by).maybeSingle();
   if(!owner?.active||owner.role!=="manager")return reply(403,"رابط العامل موقوف");
   const {data:already,error:duplicateError}=await admin
    .from("carwash_worker_link_submissions")
    .select("entry_id").eq("link_id",link.id)
    .eq("client_mutation_id",body.mutationId).maybeSingle();
   if(duplicateError)return reply(503,"تعذر التحقق من عملية محفوظة سابقًا");
   if(already?.entry_id)return NextResponse.json({
    ok:true,id:already.entry_id,duplicate:true
   },{headers:NO_STORE});
   return reply(409,"هذه العملية سُجّلت على الجهاز في يوم مختلف؛ لن تُضاف تلقائيًا لليوم الجديد. راجع المدير.");
  }
  const query=manual?admin.rpc("carwash_worker_link_record_exception",{
    p_link_hash:capabilityHash(body.token),
    p_car_type:manual.carType,p_service_type:manual.service,
    p_base_price:manual.price,p_manual_addons:manual.addons,
    p_addon_ids:addons,p_cash:cash,p_card:card,p_discount:discount,
    p_notes:notes||null,p_price_reason:manual.reason,
    p_mutation_id:body.mutationId,p_customer_phone:phone,
    p_whatsapp_consent:whatsappConsent
   }):admin.rpc("carwash_worker_link_record",{
    p_link_hash:capabilityHash(body.token),
    p_preset_id:body.presetId,p_cash:cash,p_card:card,p_discount:discount,
    p_notes:notes||null,p_client_mutation_id:body.mutationId,
    p_addon_ids:addons,p_customer_phone:phone,p_whatsapp_consent:whatsappConsent
   });
  const {data,error}=await query;
  if(error){
   const msg=error.message||"";
   if(/inactive|expired|manager account inactive|Invalid worker link/i.test(msg))
    return reply(410,"رابط العامل انتهى أو أُلغي. اطلب رابطًا جديدًا.");
   if(/limit reached|rate limit|Too many new registrations/i.test(msg))
    return reply(429,"تجاوز عدد المحاولات المسموح مؤقتًا؛ انتظر ثم أعد المزامنة.");
   if(/approved|price|discount|payment|addon|manual|not open|review/i.test(msg))
    return reply(409,"السعر أو حالة اليوم غير معتمدة؛ احتفظ بالعملية على الجهاز وراجع المدير.");
   return reply(503,"لم ينجح الحفظ؛ أعد المحاولة بنفس العملية دون تسجيل جديد.");
  }
  if(!data||data.ok!==true)return reply(503,"تعذر حفظ السيارة");
  return NextResponse.json({ok:true,id:data.id,duplicate:data.duplicate===true},
    {headers:NO_STORE});
 }catch{
  return reply(503,"تعذر الاتصال بخدمة التسجيل");
 }
}
