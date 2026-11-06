import {NextResponse} from "next/server";
import {managerAccess,createCapability,capabilityHash,NO_STORE,requestIsSameOrigin} from "@/lib/carwashCapability";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 try{
  if(!requestIsSameOrigin(request))
   return NextResponse.json({error:"Forbidden"},{status:403,headers:NO_STORE});
  const access=await managerAccess(request);
  if(!access)return NextResponse.json({error:"Manager access required"},{status:403,headers:NO_STORE});
  const token=createCapability();
  const expires_at="2099-01-01T00:00:00.000Z";
  const {error}=await access.admin.from("carwash_owner_activation_links").insert({
   token_hash:capabilityHash(token),owner_user_id:access.user.id,expires_at
  });
  if(error)return NextResponse.json({error:"تعذر إصدار الرابط"},{status:503,headers:NO_STORE});
  return NextResponse.json({ok:true,url:new URL("/admin/"+token,
    new URL(request.url).origin).toString(),expires_at},{headers:NO_STORE});
 }catch{return NextResponse.json({error:"Unavailable"},{status:503,headers:NO_STORE});}
}
