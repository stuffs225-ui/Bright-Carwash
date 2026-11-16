import {NextResponse} from "next/server";
import {managerAccess,createCapability,capabilityHash,NO_STORE,requestIsSameOrigin}
 from "@/lib/carwashCapability";
import {revealOwnerLink,sealOwnerLink,serverOwnerLinkKey} from "@/lib/ownerLinkVault";
import {createAdminClient} from "@/lib/supabaseAdmin";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const HEADERS={...NO_STORE,"Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const reject=(status:number,error:string)=>NextResponse.json({error},{status,headers:HEADERS});
const canonicalOrigin="https://bright-carwash-v2-preview.vercel.app";
type OwnerSaved={
 token_hash:string;encrypted_token:string|null;expires_at:string;created_at:string;
};
function recover(link:OwnerSaved,userId:string,key:Buffer):string{
 if(!link.encrypted_token)throw Error("Legacy manager link cannot be recovered");
 const token=revealOwnerLink(link.encrypted_token,userId,key);
 if(capabilityHash(token)!==link.token_hash)throw Error("Manager URL digest mismatch");
 return new URL("/admin/"+token,canonicalOrigin).toString();
}
async function readOwnerLinks(admin:ReturnType<typeof createAdminClient>,userId:string){
 const {data,error}=await admin.from("carwash_owner_activation_links")
  .select("token_hash,encrypted_token,expires_at,created_at")
  .eq("owner_user_id",userId).is("used_at",null)
  .gt("expires_at",new Date().toISOString())
  .order("created_at",{ascending:false}).limit(50);
 if(error)throw Error("Owner link records unavailable");
 return (data||[]) as OwnerSaved[];
}
export async function GET(request:Request){
 try{
  if(!requestIsSameOrigin(request))return reject(403,"Forbidden");
  const access=await managerAccess(request);
  if(!access)return reject(403,"Manager access required");
  const links=await readOwnerLinks(access.admin,access.user.id);
  const saved=links.find(x=>x.encrypted_token)||null;
  let url:string|null=null,recoveryFailed=false;
  if(saved){
   try{url=recover(saved,access.user.id,serverOwnerLinkKey());}
   catch{recoveryFailed=true;}
  }
  return NextResponse.json({ok:true,url,recoveryFailed,
   legacyActiveCount:links.filter(x=>!x.encrypted_token).length,
   recoverable:Boolean(url),activeCount:links.length
  },{headers:HEADERS});
 }catch{return reject(503,"تعذر قراءة رابط الإدارة المحفوظ");}
}
export async function POST(request:Request){
 try{
  if(!requestIsSameOrigin(request))return reject(403,"Forbidden");
  if(Number(request.headers.get("content-length")||"0")>1024)
   return reject(400,"Request too large");
  const access=await managerAccess(request);
  if(!access)return reject(403,"Manager access required");
  const body=await request.json().catch(()=>({}));
  const replace=body?.replace===true;
  const links=await readOwnerLinks(access.admin,access.user.id);
  if(!replace&&links.length>0){
   const saved=links.find(l=>l.encrypted_token);
   if(!saved)return reject(409,"توجد روابط إدارة قديمة لا يمكن استعادتها. اختر استبدالها لإصدار رابط واحد محفوظ.");
   try{
    return NextResponse.json({ok:true,url:recover(saved,access.user.id,serverOwnerLinkKey()),
     replaced:false,reused:true},{headers:HEADERS});
   }catch{return reject(409,"الرابط الحالي غير قابل للاسترجاع. اختر استبداله بعد التأكد من رغبتك.");}
  }
  const token=createCapability();
  const encrypted=sealOwnerLink(token,access.user.id,serverOwnerLinkKey());
  const {data,error}=await access.admin.rpc("carwash_issue_saved_owner_link",{
   p_owner:access.user.id,p_token_hash:capabilityHash(token),
   p_encrypted_token:encrypted,p_replace:replace
  });
  if(error)return reject(503,"تعذر حفظ الرابط الجديد. الروابط الحالية لم تتغير.");
  if(data!==capabilityHash(token)){
   const latest=await readOwnerLinks(access.admin,access.user.id);
   const saved=latest.find(x=>x.token_hash===data);
   if(!saved)return reject(503,"تعذر استرجاع الرابط المحفوظ");
   return NextResponse.json({ok:true,url:recover(saved,access.user.id,serverOwnerLinkKey()),
    replaced:false,reused:true},{headers:HEADERS});
  }
  return NextResponse.json({ok:true,url:new URL("/admin/"+token,canonicalOrigin).toString(),
   replaced:replace,reused:false},{headers:HEADERS});
 }catch{return reject(503,"خدمة رابط الإدارة غير متاحة");}
}
