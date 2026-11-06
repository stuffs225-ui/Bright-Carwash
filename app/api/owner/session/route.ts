import {NextRequest,NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {capabilityHash,validCapability,mintManagerSession,OWNER_COOKIE,NO_STORE,
 requestIsSameOrigin} from "@/lib/carwashCapability";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 try{
  assertDedicatedCarwashDatabase();
  if(!requestIsSameOrigin(request))return NextResponse.json({error:"Forbidden"},{status:403,headers:NO_STORE});
  const token=request.cookies.get(OWNER_COOKIE)?.value;
  if(!validCapability(token))return NextResponse.json({error:"No paired owner device"},{status:401,headers:NO_STORE});
  const admin=createAdminClient();
  const {data:device,error}=await admin.from("carwash_owner_devices")
   .select("owner_user_id,expires_at,revoked_at")
   .eq("token_hash",capabilityHash(token)).maybeSingle();
  if(error||!device||device.revoked_at||new Date(device.expires_at).getTime()<=Date.now())
   return NextResponse.json({error:"Owner device expired"},{status:401,headers:NO_STORE});
  const session=await mintManagerSession(device.owner_user_id);
  if(!session)return NextResponse.json({error:"Owner access unavailable"},{status:403,headers:NO_STORE});
  await admin.from("carwash_owner_devices").update({last_used_at:new Date().toISOString()})
   .eq("token_hash",capabilityHash(token));
  return NextResponse.json({ok:true,...session},{headers:NO_STORE});
 }catch{return NextResponse.json({error:"Unavailable"},{status:503,headers:NO_STORE});}
}
