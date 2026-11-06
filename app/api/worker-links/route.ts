import {NextResponse} from "next/server";
import {createCapability,capabilityHash,managerAccess,NO_STORE,requestIsSameOrigin} from "@/lib/carwashCapability";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reject=(status=403,message="صلاحية المدير مطلوبة")=>
 NextResponse.json({error:message},{status,headers:NO_STORE});

export async function GET(request:Request){
 try{
  const access=await managerAccess(request);
  if(!access)return reject();
  const {data,error}=await access.admin.from("carwash_worker_links")
   .select("id,label,created_at,expires_at,revoked_at,last_used_at,daily_limit")
   .eq("created_by",access.user.id).order("created_at",{ascending:false}).limit(50);
  if(error)return reject(503,"تعذر جلب الروابط");
  return NextResponse.json({links:data||[]},{headers:NO_STORE});
 }catch{return reject(503,"الخدمة غير متاحة");}
}

export async function POST(request:Request){
 try{
  if(!requestIsSameOrigin(request))return reject();
  if(Number(request.headers.get("content-length")||"0")>2048)return reject(400,"طلب غير صالح");
  const access=await managerAccess(request);
  if(!access)return reject();
  const body=await request.json().catch(()=>null);
  const label=typeof body?.label==="string"?body.label.trim():"";
  if(!label||label.length>80)return reject(400,"اكتب اسمًا مختصرًا للرابط");
  const {count,error:countError}=await access.admin.from("carwash_worker_links")
   .select("id",{count:"exact",head:true}).eq("created_by",access.user.id)
   .is("revoked_at",null).gt("expires_at",new Date().toISOString());
  if(countError)return reject(503,"تعذر التحقق من الروابط");
  if((count||0)>=10)return reject(409,"الحد الأقصى 10 روابط نشطة؛ ألغِ رابطًا قديمًا أولًا");
  const token=createCapability();
  const expires_at=new Date(Date.now()+90*86400000).toISOString();
  const {data,error}=await access.admin.from("carwash_worker_links").insert({
   token_hash:capabilityHash(token),label,created_by:access.user.id,expires_at,daily_limit:250
  }).select("id,label,expires_at").single();
  if(error||!data)return reject(503,"تعذر إنشاء الرابط");
  // A token can only be viewed once. Database contains its SHA-256 hash.
  return NextResponse.json({ok:true,link:data,
   url:new URL("/w/"+token,new URL(request.url).origin).toString()},{headers:NO_STORE});
 }catch{return reject(503,"تعذر إنشاء رابط العامل");}
}

export async function PATCH(request:Request){
 try{
  if(!requestIsSameOrigin(request))return reject();
  const access=await managerAccess(request);
  if(!access)return reject();
  const body=await request.json().catch(()=>null);
  if(typeof body?.id!=="string"||!/^[a-f0-9-]{36}$/i.test(body.id)||
   body?.action!=="revoke")return reject(400,"طلب غير صالح");
  const {data,error}=await access.admin.from("carwash_worker_links")
   .update({revoked_at:new Date().toISOString()})
   .eq("id",body.id).eq("created_by",access.user.id).is("revoked_at",null)
   .select("id").maybeSingle();
  if(error)return reject(503,"تعذر إلغاء الرابط");
  if(!data)return reject(404,"الرابط غير موجود أو ملغى");
  return NextResponse.json({ok:true},{headers:NO_STORE});
 }catch{return reject(503,"تعذر إلغاء الرابط");}
}
