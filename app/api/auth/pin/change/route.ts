import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {pinChangeIsValid} from "@/lib/carwashPinRules";
import {assertDedicatedCarwashDatabase,carwashRateKey,
 deriveManagerPinVerifier,matchesManagerPinVerifier} from "@/lib/carwashPinPassword";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, max-age=0, private"};
const fail=(status:number,error:string)=>NextResponse.json({error},{status,headers});
export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return fail(403,"طلب غير صالح");
  if(Number(request.headers.get("content-length")||"0")>2048)return fail(400,"طلب غير صالح");
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return fail(401,"سجّل الدخول أولًا");
  const body=await request.json().catch(()=>null);
  if(!pinChangeIsValid(body?.oldPin,body?.newPin))
   return fail(400,"الرمز القديم والجديد يجب أن يكونا مختلفين ومن 4 أرقام");
  const admin=createAdminClient();
  const {data,error:userError}=await admin.auth.getUser(token);
  const user=data.user;
  if(userError||!user?.email)return fail(401,"انتهت جلسة الحساب");
  const member=await admin.from("app_members").select("role,active")
   .eq("user_id",user.id).maybeSingle();
  if(member.error||!member.data?.active||!["manager","worker"].includes(member.data.role))
   return fail(403,"الحساب غير مفعل");
  const key=carwashRateKey("email",user.email.toLowerCase());
  const attempt=await admin.rpc("carwash_pin_consume_attempt",{
   p_key_hash:key,p_max_attempts:5,p_window_minutes:30
  });
  if(attempt.error)return fail(503,"خدمة الحماية غير جاهزة");
  if(attempt.data!==true)return fail(429,"المحاولات موقوفة مؤقتًا لحماية الحساب");
  const stored=await admin.from("carwash_manager_pin_verifiers")
   .select("pin_verifier").eq("user_id",user.id).maybeSingle();
  if(stored.error)return fail(503,"تعذر التحقق من الرمز");
  if(!stored.data||!matchesManagerPinVerifier(stored.data.pin_verifier,user.id,body.oldPin))
   return fail(401,"الرمز الحالي غير صحيح");
  const {error:writeError}=await admin.from("carwash_manager_pin_verifiers").update({
   pin_verifier:deriveManagerPinVerifier(user.id,body.newPin),
   updated_at:new Date().toISOString()
  }).eq("user_id",user.id);
  if(writeError)return fail(503,"لم يكتمل تغيير PIN");
  await admin.rpc("carwash_pin_clear_attempts",{p_key_hash:key});
  return NextResponse.json({ok:true,relogin:true},{headers});
 }catch{return fail(503,"تعذر إتمام الطلب الآن");}
}
