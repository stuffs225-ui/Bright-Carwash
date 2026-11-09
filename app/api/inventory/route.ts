import {NextResponse} from "next/server";
import {managerAccess,requestIsSameOrigin,NO_STORE} from "@/lib/carwashCapability";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(status:number,error:string)=>NextResponse.json({ok:false,error},{status,headers:NO_STORE});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const units=["لتر","عبوة","قطعة","كرتون","كيلو","رول"];
const sources=["cash","network","bank","other"];
const modes=["purchase","use","adjust_in","adjust_out"];
const validQty=(n:unknown)=>
 typeof n==="number"&&Number.isFinite(n)&&n>0&&n<=100000&&Math.abs(n*1000-Math.round(n*1000))<0.000001;
const validAmount=(n:unknown)=>
 typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=10000000&&Math.abs(n*100-Math.round(n*100))<0.000001;

export async function POST(request:Request){
 try{
  if(!requestIsSameOrigin(request))return reply(403,"الطلب غير مسموح");
  if(Number(request.headers.get("content-length")||0)>4096)return reply(413,"الطلب كبير جدًا");
  const access=await managerAccess(request);
  if(!access)return reply(403,"صلاحية المدير مطلوبة");
  const body=await request.json().catch(()=>null);
  const {admin,user}=access;
  if(body?.op==="list"){
   const [items,moves]=await Promise.all([
    admin.from("carwash_inventory_items")
     .select("id,name,unit,stock_qty,min_qty,avg_unit_cost,active,updated_at")
     .order("name",{ascending:true}).limit(250),
    admin.from("carwash_inventory_movements")
     .select("id,item_id,kind,quantity,total_cost,payment_source,note,occurred_at,expense_id")
     .order("occurred_at",{ascending:false}).limit(100)
   ]);
   if(items.error||moves.error)return reply(503,"تعذر تحميل المخزون؛ تأكد من تحديث قاعدة البيانات");
   return NextResponse.json({ok:true,items:items.data||[],movements:moves.data||[]},{headers:NO_STORE});
  }
  if(body?.op==="create"){
   const name=typeof body.name==="string"?body.name.trim():"";
   const unit=body.unit;
   const minQty=body.minQty;
   if(name.length<2||name.length>100||!units.includes(unit)
    ||typeof minQty!=="number"||!Number.isFinite(minQty)||minQty<0||minQty>100000
    ||Math.abs(minQty*1000-Math.round(minQty*1000))>0.000001)
    return reply(400,"اسم الصنف أو الوحدة أو الحد الأدنى غير صحيح");
   const {data,error}=await admin.from("carwash_inventory_items")
    .insert({name,unit,min_qty:minQty,created_by:user.id}).select("id").single();
   if(error)return reply(409,error.code==="23505"?"الصنف موجود مسبقًا":"تعذر إضافة الصنف");
   return NextResponse.json({ok:true,id:data?.id},{headers:NO_STORE});
  }
  if(body?.op==="update"){
   if(typeof body.id!=="string"||!uuid.test(body.id))return reply(400,"صنف غير صالح");
   const name=typeof body.name==="string"?body.name.trim():"";
   if(name.length<2||name.length>100||typeof body.minQty!=="number"||
    !Number.isFinite(body.minQty)||body.minQty<0||body.minQty>100000||
    Math.abs(body.minQty*1000-Math.round(body.minQty*1000))>0.000001||
    typeof body.active!=="boolean")
    return reply(400,"البيانات غير صالحة");
   const {data,error}=await admin.from("carwash_inventory_items")
    .update({name,min_qty:body.minQty,active:body.active,updated_at:new Date().toISOString()})
    .eq("id",body.id).select("id").single();
   if(error||!data)return reply(409,error?.code==="23505"?"الصنف موجود مسبقًا":"تعذر تعديل الصنف");
   return NextResponse.json({ok:true,id:data.id},{headers:NO_STORE});
  }
  if(body?.op==="move"){
   const {itemId,kind,qty,total,source,note,requestId}=body;
   if(typeof itemId!=="string"||!uuid.test(itemId)||
    typeof requestId!=="string"||!uuid.test(requestId)||
    !modes.includes(kind)||!validQty(qty)||!validAmount(total)||
    (kind!=="purchase"&&total!==0)||
    (kind==="purchase"&&total>0&&!sources.includes(source))||
    (typeof note!=="string"&&note!==null&&note!==undefined)||
    (typeof note==="string"&&note.trim().length>300))
    return reply(400,"حركة المخزون أو المبلغ غير صحيح");
   const {data,error}=await admin.rpc("carwash_inventory_apply",{
    p_manager:user.id,p_item:itemId,p_kind:kind,p_qty:qty,
    p_purchase_total:total,p_source:kind==="purchase"?source:null,
    p_note:note||null,p_request:requestId
   });
   if(error){
    const msg=error.message||"";
    if(/Stock cannot be negative/i.test(msg))return reply(409,"الكمية المطلوبة أكبر من المخزون المتوفر");
    if(/already under review|approved month|approved day/i.test(msg))
     return reply(409,"الفترة المحاسبية مقفلة؛ لا يمكن إضافة مصروف دون مراجعة");
    return reply(409,"تعذر حفظ حركة المخزون؛ لم يتم اعتمادها");
   }
   return NextResponse.json(data,{headers:NO_STORE});
  }
  return reply(400,"إجراء غير معروف");
 }catch{
  return reply(503,"تعذر الاتصال بخدمة المخزون");
 }
}
