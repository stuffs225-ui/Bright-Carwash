import {NextResponse} from "next/server";
import {resolveCarwashActor} from "@/lib/carwashActiveActor";
import {NO_STORE} from "@/lib/carwashCapability";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const bad=(status:number,error:string)=>NextResponse.json({error},{status,headers:NO_STORE});
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function POST(request:Request){
 try{
  const length=Number(request.headers.get("content-length")||"0");
  if(length>6_400_000)return bad(413,"الصورة كبيرة؛ يجب ضغطها إلى أقل من 6 ميجابايت");
  const fields=await request.formData();
  const id=fields.get("entryId");
  const token=fields.get("token");
  const file=fields.get("photo");
  if(typeof id!=="string"||!ID.test(id))return bad(400,"السيارة غير صالحة");
  if(!file||typeof file==="string"||typeof file.arrayBuffer!=="function")
   return bad(400,"اختر صورة السيارة أولًا");
  if(file.size<100||file.size>6_000_000||
     !["image/jpeg","image/png","image/webp"].includes(file.type))
   return bad(400,"الصورة يجب أن تكون JPG أو PNG أو WebP وبحجم 6MB كحد أقصى");
  const auth=await resolveCarwashActor(request,typeof token==="string"?token:null);
  if(!auth)return bad(403,"صلاحية العامل أو المدير غير متاحة");
  const {admin,actor,userId,linkId}=auth;
  const {data:entry,error:eError}=await admin.from("entries")
   .select("id,business_date,deleted_at").eq("id",id).maybeSingle();
  if(eError||!entry||entry.deleted_at||!entry.business_date)
   return bad(404,"السيارة غير موجودة ضمن الأيام النشطة");
  const {data:day,error:dError}=await admin.from("carwash_days")
   .select("status").eq("business_date",entry.business_date).maybeSingle();
  if(dError||!day||!["open","awaiting_owner"].includes(day.status))
   return bad(409,"لا يمكن تعديل سيارة في يوم معتمد");
  const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const path="active/"+id+"/"+crypto.randomUUID()+"."+extension;
  const upload=await admin.storage.from("carwash-ready-photos")
   .upload(path,new Uint8Array(await file.arrayBuffer()),{
    contentType:file.type,upsert:false,cacheControl:"0"
   });
  if(upload.error)return bad(503,"فشل التخزين الخاص للصورة");
  const state=await admin.rpc("carwash_readiness_action",{
   p_entry_id:id,p_action:"photo_uploaded",p_actor_type:actor,
   p_actor_user:userId,p_actor_link:linkId,p_photo_path:path
  });
  if(state.error){
   await admin.storage.from("carwash-ready-photos").remove([path]);
   return bad(409,"تعذر ربط الصورة بالسيارة؛ لم يتم الاحتفاظ بالمرفق الجديد");
  }
  return NextResponse.json({ok:true,photoAvailable:true},{headers:NO_STORE});
 }catch{return bad(503,"فشل حفظ الصورة بشكل آمن");}
}
