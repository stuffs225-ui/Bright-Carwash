import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase,deriveManagerPinVerifier} from "@/lib/carwashPinPassword";
import {validFourDigitPin} from "@/lib/carwashPinRules";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, max-age=0, private"};
const fail=(status:number,error:string)=>NextResponse.json({error},{status,headers});

/**
 * First PIN setup or PIN recovery for an email-verified, active member only.
 * An authenticated, recently issued Supabase session is required. The UI
 * obtains this with email Magic Link; it never needs a phone number.
 * We change only the private HMAC verifier, NOT the Supabase Auth password.
 */
export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  if(Number(request.headers.get("content-length")||"0")>2048)return fail(400,"طلب غير صالح");
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return fail(403,"طلب غير صالح");
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return fail(401,"تحقق من بريدك الإلكتروني وسجّل الدخول أولًا");
  const body=await request.json().catch(()=>null);
  if(!validFourDigitPin(body?.newPin)||body.newPin!==body?.confirmPin)
   return fail(400,"أدخل رمز PIN من أربعة أرقام وأكّده");
  const mode=body?.mode;
  if(mode!=="setup"&&mode!=="reset")return fail(400,"نوع الطلب غير صحيح");
  const admin=createAdminClient();
  const {data,error:authError}=await admin.auth.getUser(token);
  const user=data.user;
  if(authError||!user)return fail(401,"انتهت الجلسة. افتح رابط التحقق من البريد من جديد.");
  const member=await admin.from("app_members").select("role,active")
   .eq("user_id",user.id).maybeSingle();
  if(member.error||!member.data?.active||!["manager","worker"].includes(member.data.role))
   return fail(403,"الحساب غير مفعل في المغسلة");
  if(!user.email||!user.email_confirmed_at)return fail(403,"يجب تأكيد البريد الإلكتروني أولًا");
  const recent=Date.parse(user.last_sign_in_at||"");
  if(!Number.isFinite(recent)||recent>Date.now()+60000||Date.now()-recent>15*60000)
   return fail(403,"لأمان الحساب، أعد التحقق من بريدك الإلكتروني ثم جرّب خلال 15 دقيقة");
  const existing=await admin.from("carwash_manager_pin_verifiers")
   .select("user_id").eq("user_id",user.id).maybeSingle();
  if(existing.error)return fail(503,"تعذر التحقق من إعداد الرمز");
  if(mode==="setup"&&existing.data)return fail(409,"الرمز مفعل بالفعل؛ اختر استعادة الرمز من البريد لتغييره");
  const {error:saveError}=await admin.from("carwash_manager_pin_verifiers").upsert({
   user_id:user.id,pin_verifier:deriveManagerPinVerifier(user.id,body.newPin),
   updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(saveError)return fail(503,"لم نتمكن من حفظ الرمز الآن");
  // Stored verifier is private service-role-only. Role is never supplied by the client.
  return NextResponse.json({ok:true},{headers});
 }catch{return fail(503,"تعذر تنفيذ العملية الآن");}
}
