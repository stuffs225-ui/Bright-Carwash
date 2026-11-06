import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {normalizeSaudiMobile} from "@/lib/phone";
import {validFourDigitPin} from "@/lib/carwashPinRules";
import {assertDedicatedCarwashDatabase,carwashRateKey,deriveCarwashAuthPassword,matchesManagerPinVerifier} from "@/lib/carwashPinPassword";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const commonHeaders={"Cache-Control":"no-store, max-age=0, private"};
const fail=(status=401)=>NextResponse.json({error:status===429?
 "تم إيقاف المحاولات مؤقتًا لحماية الحساب. حاول لاحقًا.":
 status===503?"لم يكتمل ربط قاعدة بيانات المغسلة المستقلة.":
 "رقم الجوال أو الرمز غير صحيح."},{status,headers:commonHeaders});

export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  if(!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)return fail(503);
  if(Number(request.headers.get("content-length")||"0")>2048)return fail(400);
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return fail(403);
  const body=await request.json().catch(()=>null);
  const phone=normalizeSaudiMobile(typeof body?.phone==="string"?body.phone:"");
  const pin=body?.pin;
  if(!phone||!validFourDigitPin(pin))return fail();
  const admin=createAdminClient();
  // Both locks live in a transactionally updated carwash-only table.
  // A client-provided IP can be spoofed behind a proxy, so phone throttling
  // is enforced regardless and is the primary brute-force defense.
  const rawIp=request.headers.get("x-real-ip")||
    (request.headers.get("x-forwarded-for")||"").split(",")[0]||"unknown";
  const phoneKey=carwashRateKey("phone",phone);
  const ipKey=carwashRateKey("ip",rawIp.slice(0,120));
  const [p,i]=await Promise.all([
   admin.rpc("carwash_pin_consume_attempt",{
    p_key_hash:phoneKey,p_max_attempts:5,p_window_minutes:30,
   }),
   admin.rpc("carwash_pin_consume_attempt",{
    p_key_hash:ipKey,p_max_attempts:25,p_window_minutes:30,
   })
  ]);
  if(p.error||i.error)return fail(503);
  if(p.data!==true||i.data!==true)return fail(429);
  let accountId:string|null=null;
  let accountEmail:string|null=null;
  let phoneVerified=false;
  for(let page=1;page<=20;page++){
   const found=await admin.auth.admin.listUsers({page,perPage:100});
   if(found.error)return fail(503);
   const match=found.data.users.find(u=>u.phone===phone);
   if(match){accountId=match.id;accountEmail=match.email||null;phoneVerified=!!match.phone_confirmed_at;break;}
   if(found.data.users.length<100)break;
  }
  if(!accountId)return fail();
  const login=createClient(
   process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
   {auth:{persistSession:false,autoRefreshToken:false}}
  );
  let {data,error}=await login.auth.signInWithPassword({
   phone,password:deriveCarwashAuthPassword(accountId,pin),
  });
  if(error||!data.session||!data.user){
   // The manager's PIN is intentionally independent of the email password.
   // Workers continue to use the existing Supabase password-derived PIN.
   if(!accountEmail||!phoneVerified)return fail();
   const manager=await admin.from("app_members").select("role,active")
    .eq("user_id",accountId).maybeSingle();
   if(manager.error||manager.data?.role!=="manager"||!manager.data.active)return fail();
   const lookup=await admin.from("carwash_manager_pin_verifiers")
    .select("pin_verifier").eq("user_id",accountId).maybeSingle();
   if(lookup.error||!lookup.data||
      !matchesManagerPinVerifier(lookup.data.pin_verifier,accountId,pin))return fail();
   const generated=await admin.auth.admin.generateLink({type:"magiclink",email:accountEmail});
   const tokenHash=generated.data?.properties?.hashed_token;
   if(generated.error||generated.data.user?.id!==accountId||!tokenHash)return fail(503);
   const verified=await login.auth.verifyOtp({token_hash:tokenHash,type:"magiclink"});
   if(verified.error||!verified.data.session||verified.data.user?.id!==accountId)return fail(503);
   data=verified.data;
  }
  const check=await admin.from("app_members").select("role,active")
   .eq("user_id",data.user.id).maybeSingle();
  if(check.error||!check.data?.active||
   !["manager","worker"].includes(check.data.role)){
    await login.auth.signOut({scope:"local"});
    return fail();
  }
  // The successful phone-specific count is cleared. The IP count remains
  // to stop cycling many phone numbers from the same source.
  await admin.rpc("carwash_pin_clear_attempts",{p_key_hash:phoneKey});
  return NextResponse.json({
   access_token:data.session.access_token,
   refresh_token:data.session.refresh_token,
   expires_at:data.session.expires_at,
   role:check.data.role,
  },{headers:commonHeaders});
 }catch{
  return fail(503);
 }
}
