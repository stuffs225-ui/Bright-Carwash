import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {capabilityHash,validCapability,NO_STORE,requestIsSameOrigin} from "@/lib/carwashCapability";
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
  if(!validCapability(body?.token)||typeof body?.presetId!=="string"||
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
