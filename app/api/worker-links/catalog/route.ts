import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {capabilityHash,validCapability,managerAccess,NO_STORE,requestIsSameOrigin} from "@/lib/carwashCapability";
export const runtime="nodejs";
export const dynamic="force-dynamic";

const deny=(code:number,message:string)=>NextResponse.json({error:message},{status:code,headers:NO_STORE});
export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  if(!requestIsSameOrigin(request))return deny(403,"الرابط غير صالح");
  if(Number(request.headers.get("content-length")||"0")>2048)return deny(400,"طلب غير صالح");
  const body=await request.json().catch(()=>null);
  const viaWorker=validCapability(body?.token);
  const manager=viaWorker?null:await managerAccess(request);
  if(!viaWorker&&!manager)return deny(403,"رابط أو جلسة الإدارة غير صالح");
  const admin=manager?.admin||createAdminClient();
  let label="الإدارة — تسجيل السيارات";
  if(viaWorker){
   const {data:link,error}=await admin.from("carwash_worker_links")
    .select("id,label,expires_at,revoked_at,created_by")
    .eq("token_hash",capabilityHash(body.token)).maybeSingle();
   if(error)return deny(503,"الخدمة غير متاحة");
   if(!link||link.revoked_at||new Date(link.expires_at).getTime()<=Date.now())
    return deny(410,"هذا الرابط ملغى أو انتهت صلاحيته. اطلب رابطًا جديدًا من المدير.");
   const {data:member}=await admin.from("app_members").select("role,active")
    .eq("user_id",link.created_by).maybeSingle();
   if(!member?.active||member.role!=="manager")return deny(403,"رابط العامل موقوف");
   label=link.label;
  }
  const [presets,addons]=await Promise.all([
   admin.from("entry_presets").select("id,car_type,service_type,amount").eq("active",true)
    .order("sort_order",{ascending:true}),
   admin.from("carwash_addons").select("id,name,price").eq("active",true)
    .order("name",{ascending:true})
  ]);
  if(presets.error||addons.error)return deny(503,"تعذر تحميل الخدمات");
  return NextResponse.json({label,
   presets:presets.data||[],addons:addons.data||[]},{headers:NO_STORE});
 }catch{return deny(503,"الخدمة غير متاحة");}
}
