import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {createCapability,capabilityHash,validCapability,mintManagerSession,
 OWNER_COOKIE,OWNER_COOKIE_AGE,NO_STORE,requestIsSameOrigin} from "@/lib/carwashCapability";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const fail=(code:number)=>NextResponse.json({error:
 code===410?"رابط الإدارة مستعمل أو منتهي. يجب إنشاء رابط جديد.":
 "رابط الإدارة غير صالح أو تعذر التحقق منه."},{status:code,headers:NO_STORE});
export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  if(!requestIsSameOrigin(request))return fail(403);
  if(Number(request.headers.get("content-length")||"0")>1024)return fail(400);
  const body=await request.json().catch(()=>null);
  if(!validCapability(body?.token))return fail(403);
  const admin=createAdminClient();
  const {data:link,error:consumeError}=await admin.from("carwash_owner_activation_links")
   .update({used_at:new Date().toISOString()})
   .eq("token_hash",capabilityHash(body.token))
   .is("used_at",null).gt("expires_at",new Date().toISOString())
   .select("owner_user_id").maybeSingle();
  if(consumeError)return fail(503);
  if(!link)return fail(410);
  const session=await mintManagerSession(link.owner_user_id);
  if(!session)return fail(503);
  const deviceToken=createCapability();
  const {error:deviceError}=await admin.from("carwash_owner_devices").insert({
   token_hash:capabilityHash(deviceToken),owner_user_id:link.owner_user_id,
   expires_at:new Date(Date.now()+OWNER_COOKIE_AGE*1000).toISOString()
  });
  if(deviceError)return fail(503);
  const response=NextResponse.json({ok:true,...session},{headers:NO_STORE});
  response.cookies.set(OWNER_COOKIE,deviceToken,{
   httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:OWNER_COOKIE_AGE
  });
  return response;
 }catch{return fail(503);}
}
