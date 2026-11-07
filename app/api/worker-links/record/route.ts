import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {capabilityHash,validCapability,managerAccess,NO_STORE,requestIsSameOrigin} from "@/lib/carwashCapability";
export const runtime="nodejs";
export const dynamic="force-dynamic";

const reply=(status:number,error:string)=>NextResponse.json({error},{status,headers:NO_STORE});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function money(value:unknown):number|null{
 if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>100000||
    Math.abs(Math.round(value*100)-value*100)>0.000001)return null;
 return value;
}
export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  if(!requestIsSameOrigin(request))return reply(403,"طلب غير مسموح");
  if(Number(request.headers.get("content-length")||"0")>4096)return reply(400,"طلب كبير جدًا");
  const body=await request.json().catch(()=>null);
  const viaWorker=validCapability(body?.token);
  if(typeof body?.presetId!=="string"||
      !uuid.test(body.presetId)||typeof body?.mutationId!=="string"||
      !uuid.test(body.mutationId))return reply(400,"الرابط أو بيانات الخدمة غير صالحة");
  const cash=money(body.cash),card=money(body.card),discount=money(body.discount);
  if(cash===null||card===null||discount===null||discount>10)
   return reply(400,"المدفوعات أو الخصم غير صالحة");
  const notes=typeof body.notes==="string"?body.notes.trim():"";
  if(notes.length>500)return reply(400,"الملاحظات طويلة جدًا");
  const addons=Array.isArray(body.addons)?body.addons:null;
  if(!addons||addons.length>8||addons.some((id:unknown)=>typeof id!=="string"||!uuid.test(id))||
     new Set(addons).size!==addons.length)return reply(400,"الإضافات غير صالحة");
  const phone=body.customerPhone===undefined||body.customerPhone===""?null:body.customerPhone;
  if(phone!==null&&(typeof phone!=="string"||!/^\+9665\d{8}$/.test(phone)))
   return reply(400,"رقم العميل غير صالح");
  const whatsappConsent=body.whatsappConsent===true;
  if(whatsappConsent&&!phone)return reply(400,"يلزم رقم العميل للموافقة على واتساب");
  if(!viaWorker){
   // Manager uses the identical screen but writes through their own authenticated
   // Supabase JWT, so native RLS, business-date and audit triggers remain active.
   const access=await managerAccess(request);
   if(!access)return reply(403,"صلاحية المدير مطلوبة");
   const {data:preset,error:presetError}=await access.admin.from("entry_presets")
    .select("car_type,service_type,amount").eq("id",body.presetId).eq("active",true).maybeSingle();
   if(presetError||!preset)return reply(409,"الخدمة غير متاحة");
   const {data:extras,error:extraError}=addons.length?await access.admin.from("carwash_addons")
    .select("id,price").in("id",addons).eq("active",true):
    {data:[],error:null};
   if(extraError||(extras||[]).length!==addons.length)return reply(409,"إحدى الإضافات غير مفعلة");
   const expected=Math.round((Number(preset.amount)+(extras||[]).reduce((v,a)=>v+Number(a.price),0))*100);
   if(Math.round((cash+card+discount)*100)!==expected)
    return reply(409,"المبالغ لا تطابق الأسعار المعتمدة");
   const already=await access.admin.from("entries").select("id")
    .eq("created_by",access.user.id).eq("client_mutation_id",body.mutationId)
    .maybeSingle();
   if(already.error)return reply(503,"تعذر التحقق من تكرار العملية");
   if(already.data?.id)return NextResponse.json({ok:true,id:already.data.id,duplicate:true},{headers:NO_STORE});
   const jwt=(request.headers.get("authorization")||"").replace(/^Bearer\\s+/i,"");
   const userClient=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
     auth:{persistSession:false,autoRefreshToken:false},
     global:{headers:{Authorization:"Bearer "+jwt}}
    });
   const {data:inserted,error:insertError}=await userClient.from("entries").insert({
    car_type:preset.car_type,service_type:preset.service_type,
    cash_paid:cash,card_paid:card,discount_amount:discount,
    addon_ids:addons,customer_phone:phone,whatsapp_consent:whatsappConsent,
    sms_consent:false,notes:notes||null,occurred_at:new Date().toISOString(),
    created_by:access.user.id,client_mutation_id:body.mutationId
   }).select("id").single();
   if(insertError){
    if(/approved|review|day|price|discount|payment|rate/i.test(insertError.message))
     return reply(409,"اليوم غير متاح أو البيانات لا تطابق السعر المعتمد");
    return reply(503,"تعذر تسجيل السيارة بواسطة جلسة المدير");
   }
   return NextResponse.json({ok:true,id:inserted?.id,duplicate:false},{headers:NO_STORE});
  }
  const admin=createAdminClient();
  // The function is explicitly EXECUTE-service_role only and enforces
  // expiry, price, per-link limits, idempotency and native business triggers.
  const {data,error}=await admin.rpc("carwash_worker_link_record",{
   p_link_hash:capabilityHash(body.token),
   p_preset_id:body.presetId,
   p_cash:cash,p_card:card,p_discount:discount,
   p_notes:notes||null,p_client_mutation_id:body.mutationId,
   p_addon_ids:addons,p_customer_phone:phone,p_whatsapp_consent:whatsappConsent
  });
  if(error){
   const msg=error.message||"";
   if(/inactive|expired|manager account inactive|Invalid worker link/i.test(msg))
    return reply(410,"رابط العامل ملغى أو انتهى. اطلب رابطًا جديدًا من المدير.");
   if(/Daily worker link limit|Too many new registrations/i.test(msg))
    return reply(429,"تم الوصول إلى حد التسجيلات المؤقت. راجع المدير.");
   if(/Carwash day.*review|approved|not an active|price|discount|payment/i.test(msg))
    return reply(409,"تعذر التسجيل: اليوم معتمد أو السعر غير مطابق للقائمة. حدّث الصفحة.");
   return reply(503,"تعذر تسجيل السيارة. حاول مجددًا دون تغيير النموذج.");
  }
  if(!data||data.ok!==true)return reply(503,"تعذر حفظ السيارة");
  return NextResponse.json({ok:true,id:data.id,duplicate:data.duplicate===true},
   {headers:NO_STORE});
 }catch{return reply(503,"تعذر الاتصال بخدمة التسجيل");}
}
