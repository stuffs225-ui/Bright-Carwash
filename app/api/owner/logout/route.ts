import {NextRequest,NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {capabilityHash,validCapability,OWNER_COOKIE,NO_STORE,
 requestIsSameOrigin} from "@/lib/carwashCapability";
export const runtime="nodejs";
export async function POST(request:NextRequest){
 if(!requestIsSameOrigin(request))
  return NextResponse.json({error:"Forbidden"},{status:403,headers:NO_STORE});
 try{
  assertDedicatedCarwashDatabase();
  const token=request.cookies.get(OWNER_COOKIE)?.value;
  if(validCapability(token)){
   const admin=createAdminClient();
   await admin.from("carwash_owner_devices").update({revoked_at:new Date().toISOString()})
    .eq("token_hash",capabilityHash(token));
  }
  const response=NextResponse.json({ok:true},{headers:NO_STORE});
  response.cookies.set(OWNER_COOKIE,"",{path:"/",httpOnly:true,secure:true,
    sameSite:"lax",maxAge:0});
  return response;
 }catch{return NextResponse.json({error:"Unable to sign out"},{status:503,headers:NO_STORE});}
}
