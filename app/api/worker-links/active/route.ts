import {NextResponse} from "next/server";
import {resolveCarwashActor} from "@/lib/carwashActiveActor";
import {NO_STORE} from "@/lib/carwashCapability";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(status:number,error:string)=>NextResponse.json({error},{status,headers:NO_STORE});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function POST(request:Request){
 try{
  if(Number(request.headers.get("content-length")||"0")>4096)return reply(400,"الطلب كبير");
  const body=await request.json().catch(()=>null);
  const auth=await resolveCarwashActor(request,body?.token);
  if(!auth)return reply(403,"رابط العامل أو جلسة المدير غير نشطة");
  const {admin,actor,userId,linkId}=auth;
  const operation=body?.op??"list";
  if(operation==="list"){
   const {data:days,error:daysError}=await admin.from("carwash_days")
    .select("business_date").in("status",["open","awaiting_owner"])
    .order("business_date",{ascending:false}).limit(120);
   if(daysError)return reply(503,"تعذر قراءة الأيام");
   const dates=(days||[]).map(x=>x.business_date);
   if(!dates.length)return NextResponse.json({ok:true,cars:[],message:"لا توجد سيارات نشطة"},{headers:NO_STORE});
   const {data:cars,error:carError}=await admin.from("entries")
    .select("id,car_type,service_type,occurred_at,business_date,cash_paid,card_paid,discount_amount,customer_phone,whatsapp_consent,notes")
    .is("deleted_at",null).in("business_date",dates)
    .order("occurred_at",{ascending:false}).limit(250);
   if(carError)return reply(503,"تعذر قراءة السيارات النشطة");
   const ids=(cars||[]).map(x=>x.id);
   const {data:states,error:stateError}=ids.length?await admin.from("carwash_entry_readiness")
    .select("entry_id,status,ready_at,delivered_at,photo_path,share_requested_at")
    .in("entry_id",ids):{data:[],error:null};
   if(stateError)return reply(503,"تعذر قراءة حالات الجاهزية");
   const statuses=new Map((states||[]).map(r=>[r.entry_id,r]));
   const cfg=await admin.from("settings").select("value")
    .eq("key","whatsapp_ready_text").maybeSingle();
   const message=typeof cfg.data?.value==="string"&&cfg.data.value.trim()
    ?cfg.data.value.trim():"مرحبًا، سيارتك جاهزة للاستلام من مغسلة سيارتك اللامعة. شكرًا لزيارتك ونتشرف بخدمتك دائمًا.";
   return NextResponse.json({ok:true,readyMessage:message,truncated:(cars||[]).length===250,
    cars:(cars||[]).map(r=>{
     const st=statuses.get(r.id);
     return {
      id:r.id,carType:r.car_type,serviceType:r.service_type,
      date:r.business_date,occurredAt:r.occurred_at,
      cash:Number(r.cash_paid),card:Number(r.card_paid),
      discount:Number(r.discount_amount),
      phone:r.whatsapp_consent?r.customer_phone:null,
      consent:r.whatsapp_consent===true,
      status:st?.status||"washing",
      readyAt:st?.ready_at||null,deliveredAt:st?.delivered_at||null,
      photoAvailable:!!st?.photo_path,shareRequestedAt:st?.share_requested_at||null
     };
    })
   },{headers:NO_STORE});
  }
  if(typeof body?.entryId!=="string"||!uuid.test(body.entryId))
   return reply(400,"معرف السيارة غير صالح");
  if(operation==="ready"||operation==="delivered"||operation==="share_opened"){
   const {data,error}=await admin.rpc("carwash_readiness_action",{
    p_entry_id:body.entryId,p_action:operation,p_actor_type:actor,
    p_actor_user:userId,p_actor_link:linkId,p_photo_path:null
   });
   if(error)return reply(409,"تعذر تحديث الحالة: "+error.message.slice(0,140));
   return NextResponse.json(data,{headers:NO_STORE});
  }
  if(operation==="photo"){
   const {data:entry,error}=await admin.from("entries")
    .select("id,business_date,deleted_at").eq("id",body.entryId).maybeSingle();
   if(error||!entry||entry.deleted_at||!entry.business_date)return reply(404,"السيارة غير متاحة");
   const day=await admin.from("carwash_days").select("status")
    .eq("business_date",entry.business_date).maybeSingle();
   if(day.error||!day.data||day.data.status==="approved")return reply(403,"هذه السيارة في يوم معتمد");
   const photo=await admin.from("carwash_entry_readiness").select("photo_path")
    .eq("entry_id",body.entryId).maybeSingle();
   if(photo.error||!photo.data?.photo_path)return reply(404,"لا توجد صورة محفوظة");
   const url=await admin.storage.from("carwash-ready-photos")
    .createSignedUrl(photo.data.photo_path,90);
   if(url.error||!url.data?.signedUrl)return reply(503,"تعذر فتح الصورة");
   return NextResponse.json({ok:true,url:url.data.signedUrl,expiresIn:90},{headers:NO_STORE});
  }
  return reply(400,"إجراء غير معروف");
 }catch{return reply(503,"تعذر تنفيذ إجراء الجاهزية");}
}
