import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {validFourDigitPin} from "@/lib/carwashPinRules";
import {assertDedicatedCarwashDatabase,carwashRateKey,matchesManagerPinVerifier} from "@/lib/carwashPinPassword";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, max-age=0, private"};
const fail=(status=401)=>NextResponse.json({error:
 status===429?"تم إيقاف المحاولات مؤقتًا لحماية الحساب. حاول بعد 30 دقيقة.":
 status===503?"خدمة الدخول غير جاهزة، حاول لاحقًا.":
 "البريد الإلكتروني أو الرمز غير صحيح، أو الحساب غير مفعل."},{status,headers});

export async function POST(request:Request){
 try {
  assertDedicatedCarwashDatabase();
  if(!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)return fail(503);
  if(Number(request.headers.get("content-length")||"0")>2048)return fail(400);
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return fail(403);
  const body=await request.json().catch(()=>null);
  const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
  const pin=body?.pin;
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!validFourDigitPin(pin))return fail();
  const admin=createAdminClient();
  // Protect the 10,000-combination PIN: per-email AND per-IP transactionally,
  // including requests for nonexistent emails. Never log credentials.
  const rawIp=request.headers.get("x-real-ip")||
    (request.headers.get("x-forwarded-for")||"").split(",")[0]||"unknown";
  const emailKey=carwashRateKey("email",email);
  const ipKey=carwashRateKey("ip",rawIp.slice(0,120));
  const [emailLimit,ipLimit]=await Promise.all([
   admin.rpc("carwash_pin_consume_attempt",{p_key_hash:emailKey,p_max_attempts:5,p_window_minutes:30}),
   admin.rpc("carwash_pin_consume_attempt",{p_key_hash:ipKey,p_max_attempts:25,p_window_minutes:30})
  ]);
  if(emailLimit.error||ipLimit.error)return fail(503);
  if(emailLimit.data!==true||ipLimit.data!==true)return fail(429);
  let matched: {id:string;email?:string;email_confirmed_at?:string|null}|null=null;
  for(let page=1;page<=20;page++){
   const found=await admin.auth.admin.listUsers({page,perPage:100});
   if(found.error)return fail(503);
   const user=found.data.users.find(u=>u.email?.toLowerCase()===email);
   if(user){matched=user;break;}
   if(found.data.users.length<100)break;
  }
  if(!matched?.email_confirmed_at)return fail();
  const member=await admin.from("app_members").select("role,active")
    .eq("user_id",matched.id).maybeSingle();
  if(member.error||!member.data?.active||!["manager","worker"].includes(member.data.role))return fail();
  const stored=await admin.from("carwash_manager_pin_verifiers")
    .select("pin_verifier").eq("user_id",matched.id).maybeSingle();
  if(stored.error)return fail(503);
  if(!stored.data||!matchesManagerPinVerifier(stored.data.pin_verifier,matched.id,pin))return fail();
  // Use a one-use GoTrue token to create a REAL Supabase session after PIN verification.
  // The token, admin key and derived PIN verifier never reach the browser.
  const generated=await admin.auth.admin.generateLink({type:"magiclink",email});
  const hash=generated.data?.properties?.hashed_token;
  if(generated.error||generated.data.user?.id!==matched.id||!hash)return fail(503);
  const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
     {auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await auth.auth.verifyOtp({token_hash:hash,type:"magiclink"});
  if(verified.error||!verified.data.session||verified.data.user?.id!==matched.id)return fail(503);
  await admin.rpc("carwash_pin_clear_attempts",{p_key_hash:emailKey});
  return NextResponse.json({
   access_token:verified.data.session.access_token,
   refresh_token:verified.data.session.refresh_token,
   role:member.data.role
  },{headers});
 }catch{return fail(503);}
}
