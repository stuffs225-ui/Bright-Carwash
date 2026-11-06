import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase,deriveManagerPinVerifier} from "@/lib/carwashPinPassword";
import {validFourDigitPin} from "@/lib/carwashPinRules";
import {normalizeSaudiMobile} from "@/lib/phone";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, max-age=0, private"};
function fail(status:number,error:string){
 return NextResponse.json({error},{status,headers});
}

/**
 * First-time phone/PIN enrollment on the SAME manager Auth user.
 * A verified phone and recent email-authentication are both mandatory.
 * Store an independent peppered verifier; email/password and worker PIN stay intact.
 * No new Auth identity is created and no Supabase Auth password is modified.
 */
export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  if(Number(request.headers.get("content-length")||"0")>2048)
   return fail(400,"طلب غير صالح");
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)
   return fail(403,"طلب غير صالح");
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return fail(401,"يجب تسجيل الدخول أولًا");
  const body=await request.json().catch(()=>null);
  if(!validFourDigitPin(body?.newPin)||body.newPin!==body?.confirmPin||
    body?.confirmEnrollment!==true)
   return fail(400,"الرمز يجب أن يكون 4 أرقام ومتطابقًا مع التأكيد، مع الموافقة الصريحة");
  const admin=createAdminClient();
  const {data,error:authError}=await admin.auth.getUser(token);
  const user=data.user;
  if(authError||!user)return fail(401,"انتهت الجلسة. سجّل الدخول بالبريد مجددًا");
  const {data:membership,error:memberError}=await admin.from("app_members")
   .select("role,active").eq("user_id",user.id).maybeSingle();
  if(memberError||!membership?.active||membership.role!=="manager")
   return fail(403,"عملية إعداد المدير فقط");
  if(!user.email_confirmed_at||!user.phone_confirmed_at||
     !normalizeSaudiMobile(user.phone||""))
   return fail(403,"يجب توثيق البريد والجوال عبر Supabase أولًا");
  const lastLogin=Date.parse(user.last_sign_in_at||"");
  if(!Number.isFinite(lastLogin)||Date.now()-lastLogin>15*60*1000)
   return fail(403,"لتأكيد الهوية سجّل الدخول مجددًا بالبريد ثم أعد المحاولة");
  const {data:existing,error:lookupError}=await admin.from("carwash_manager_pin_verifiers")
   .select("user_id").eq("user_id",user.id).maybeSingle();
  if(lookupError)return fail(503,"تعذر قراءة إعدادات PIN");
  if(existing)return fail(409,"تم إعداد PIN مسبقًا. استخدم تغيير الرمز الحالي.");
  const {error:insertError}=await admin.from("carwash_manager_pin_verifiers").insert({
   user_id:user.id,pin_verifier:deriveManagerPinVerifier(user.id,body.newPin),
  });
  if(insertError)return fail(503,"تعذر تسجيل رمز PIN الآن");
  // Metadata drives only the account-settings presentation, never authorization.
  const {error:updateError}=await admin.auth.admin.updateUserById(user.id,{
   app_metadata:{...(user.app_metadata||{}),carwash_pin_enrolled_at:new Date().toISOString()}
  });
  if(updateError){
   await admin.from("carwash_manager_pin_verifiers").delete().eq("user_id",user.id);
   return fail(503,"تعذر إكمال إعداد PIN، ولم تتغير كلمة مرور الإيميل");
  }
  return NextResponse.json({ok:true,relogin:true},{headers});
 }catch{
  return fail(503,"تعذر إكمال إعداد رمز الدخول");
 }
}
