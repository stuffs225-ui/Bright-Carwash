import {NextResponse} from "next/server";
import {createCapability,capabilityHash,managerAccess,NO_STORE,requestIsSameOrigin}
 from "@/lib/carwashCapability";
import {serverWorkerLinkKey,sealWorkerLinkToken,revealWorkerLinkToken}
 from "@/lib/workerLinkVault";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const HEADER={...NO_STORE,"Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const reject=(status=403,message="صلاحية المدير مطلوبة")=>
 NextResponse.json({error:message},{status,headers:HEADER});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const validLabel=(s:unknown):s is string=>typeof s==="string"&&
 s.trim().length>=1&&s.trim().length<=80;

export async function GET(request:Request){
 try{
  const access=await managerAccess(request);
  if(!access)return reject();
  const {data,error}=await access.admin.from("carwash_worker_links")
   .select("id,label,created_at,expires_at,revoked_at,last_used_at,daily_limit,token_hash,encrypted_token")
   .eq("created_by",access.user.id).order("created_at",{ascending:false}).limit(50);
  if(error)return reject(503,"تعذر جلب الروابط");
  const key=serverWorkerLinkKey();
  const origin=new URL(request.url).origin;
  const links=(data||[]).map(link=>{
   const {token_hash,encrypted_token,...safe}=link;
   const active=!link.revoked_at&&Date.parse(link.expires_at)>Date.now();
   let url:string|null=null;
   let recoveryFailed=false;
   if(active&&encrypted_token){
    try{
     const token=revealWorkerLinkToken(encrypted_token,access.user.id,key);
     if(capabilityHash(token)!==token_hash)throw Error("Link integrity mismatch");
     url=new URL("/w/"+token,origin).toString();
    }catch{recoveryFailed=true;}
   }
   return {...safe,url,recoveryFailed,recoverable:Boolean(encrypted_token)};
  });
  return NextResponse.json({links},{headers:HEADER});
 }catch{return reject(503,"الخدمة غير متاحة");}
}

export async function POST(request:Request){
 try{
  if(!requestIsSameOrigin(request))return reject();
  if(Number(request.headers.get("content-length")||"0")>2048)
   return reject(400,"طلب غير صالح");
  const access=await managerAccess(request);
  if(!access)return reject();
  const body=await request.json().catch(()=>null);
  if(!validLabel(body?.label))return reject(400,"اكتب اسمًا مختصرًا للرابط");
  const replacement=body?.replace===true;
  const token=createCapability();
  const encrypted=sealWorkerLinkToken(token,access.user.id,serverWorkerLinkKey());
  const expires=new Date(Date.now()+90*86400000).toISOString();
  const {data,error}=await access.admin.rpc("carwash_issue_saved_worker_link",{
   p_manager:access.user.id,p_token_hash:capabilityHash(token),
   p_encrypted_token:encrypted,p_label:body.label.trim(),
   p_expires_at:expires,p_replace:replacement
  });
  if(error)return error.message.includes("Active worker link exists")
   ?reject(409,"يوجد رابط نشط بالفعل؛ اختر استبداله إذا كنت تريد إيقاف الرابط السابق")
   :reject(503,"تعذر إنشاء الرابط الجديد؛ لم يتم تغيير الرابط السابق");
  return NextResponse.json({ok:true,linkId:data,
   url:new URL("/w/"+token,new URL(request.url).origin).toString(),
   replaced:replacement
  },{headers:HEADER});
 }catch{return reject(503,"تعذر إنشاء رابط العامل؛ الرابط السابق لم يتغير");}
}

export async function PATCH(request:Request){
 try{
  if(!requestIsSameOrigin(request))return reject();
  if(Number(request.headers.get("content-length")||"0")>2048)
   return reject(400,"طلب غير صالح");
  const access=await managerAccess(request);
  if(!access)return reject();
  const body=await request.json().catch(()=>null);
  if(typeof body?.id!=="string"||!uuid.test(body.id)||
   !["revoke","rename"].includes(body?.action))return reject(400,"طلب غير صالح");
  if(body.action==="rename"&&!validLabel(body?.label))
   return reject(400,"اكتب اسمًا صحيحًا للرابط");
  const patch=body.action==="rename"
   ?{label:body.label.trim()}
   :{revoked_at:new Date().toISOString()};
  const query=access.admin.from("carwash_worker_links")
   .update(patch).eq("id",body.id).eq("created_by",access.user.id);
  const {data,error}=await (body.action==="revoke"
   ?query.is("revoked_at",null).select("id").maybeSingle()
   :query.is("revoked_at",null).gt("expires_at",new Date().toISOString())
     .select("id").maybeSingle());
  if(error)return reject(503,"تعذر تحديث الرابط");
  if(!data)return reject(404,"الرابط غير موجود أو ملغى");
  return NextResponse.json({ok:true},{headers:HEADER});
 }catch{return reject(503,"تعذر تحديث رابط العامل");}
}
