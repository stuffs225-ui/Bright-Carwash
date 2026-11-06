import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {pinChangeIsValid} from "@/lib/carwashPinRules";
import {assertDedicatedCarwashDatabase,carwashRateKey,deriveCarwashAuthPassword} from "@/lib/carwashPinPassword";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, max-age=0, private"};
const fail=(status:number,message:string)=>
 NextResponse.json({error:message},{status,headers});

export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return fail(403,"طلب غير صالح");
  if(Number(request.headers.get("content-length")||"0")>2048)return fail(400,"طلب غير صالح");
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return fail(401,"سجّل الدخول أولًا");
  const body=await request.json().catch(()=>null);
  if(!pinChangeIsValid(body?.oldPin,body?.newPin))return fail(400,"أدخل الرمز القديم ورمزًا جديدًا مختلفًا من 4 أرقام");
  const admin=createAdminClient();
  const {data:userData,error:userError}=await admin.auth.getUser(token);
  const user=userData.user;
  if(userError||!user?.phone)return fail(401,"انتهت صلاحية الجلسة");
  const {data:member,error:memberError}=await admin.from("app_members")
   .select("role,active").eq("user_id",user.id).maybeSingle();
  if(memberError||!member?.active||!["manager","worker"].includes(member.role))
   return fail(403,"الحساب غير مفعّل");

  const key=carwashRateKey("phone",user.phone);
  const attempt=await admin.rpc("carwash_pin_consume_attempt",{
   p_key_hash:key,p_max_attempts:5,p_window_minutes:30,
  });
  if(attempt.error)return fail(503,"خدمة حماية الدخول غير جاهزة");
  if(attempt.data!==true)return fail(429,"تم إيقاف المحاولات مؤقتًا لحماية الحساب");

  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
  const old=await client.auth.signInWithPassword({
   phone:user.phone,password:deriveCarwashAuthPassword(user.id,body.oldPin),
  });
  if(old.error||old.data.user?.id!==user.id){
   return fail(401,"الرمز الحالي غير صحيح");
  }
  const {error}=await admin.auth.admin.updateUserById(user.id,{
   password:deriveCarwashAuthPassword(user.id,body.newPin),
  });
  if(error)return fail(503,"لم يكتمل تغيير الرمز");
  await admin.rpc("carwash_pin_clear_attempts",{p_key_hash:key});
  return NextResponse.json({ok:true,relogin:true},{headers});
 }catch{
  return fail(503,"تعذر إتمام الطلب؛ تحقق من إعدادات المغسلة");
 }
}
