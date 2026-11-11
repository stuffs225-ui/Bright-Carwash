"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
type Car={id:string;carType:string;serviceType:string;date:string;occurredAt:string;
 cash:number;card:number;discount:number;phone:string|null;consent:boolean;
 status:"washing"|"ready"|"delivered";photoAvailable:boolean;readyAt:string|null;
 deliveredAt:string|null;shareRequestedAt:string|null};
const statusText={washing:"قيد الغسيل",ready:"جاهزة للاستلام",delivered:"تم التسليم"};
const time=(s:string)=>new Date(s).toLocaleTimeString("ar-SA-u-nu-latn",{
 timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit"});
async function imageForShare(raw:File):Promise<File>{
 if(raw.size<100)throw Error("الصورة فارغة");
 if(!raw.type.startsWith("image/"))throw Error("اختر ملف صورة");
 const image=new Image();
 const url=URL.createObjectURL(raw);
 try{
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();
   image.onerror=()=>reject(Error("تعذر قراءة صورة السيارة"));
   image.src=url;
  });
  const scale=Math.min(1,1440/Math.max(image.width,image.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(image.width*scale));
  canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("تعذر ضغط الصورة");
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",0.78));
  if(!blob)throw Error("لم ينجح تجهيز الصورة");
  if(blob.size>6_000_000)throw Error("الصورة لا تزال كبيرة؛ اختر صورة أصغر");
  return new File([blob],"carwash-ready.jpg",{type:"image/jpeg"});
 }finally{URL.revokeObjectURL(url);}
}

export function ReadyCarsPanel({token,manager=false,refreshKey=0}:{
 token?:string;manager?:boolean;refreshKey?:number
}){
 const [open,setOpen]=useState(false);
 const [cars,setCars]=useState<Car[]>([]);
 const [readyMessage,setReadyMessage]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [files,setFiles]=useState<Record<string,File>>({});
 const [brandedImage,setBrandedImage]=useState<File|null>(null);
 const preloadAttempted=useRef(new Set<string>());
 const [truncated,setTruncated]=useState(false);
 const headers=useCallback(async(contentType=true)=>{
  const h:Record<string,string>={};
  if(contentType)h["content-type"]="application/json";
  if(manager){
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)throw Error("يجب استعادة جلسة المدير");
   h.authorization="Bearer "+session.access_token;
  }
  return h;
 },[manager]);
 const call=useCallback(async(op:string,entryId?:string)=>{
  const response=await fetch("/api/worker-links/active",{
   method:"POST",headers:await headers(),
   body:JSON.stringify({op,entryId,...(token?{token}:{})}),
   credentials:"same-origin",cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"تعذر تحميل السيارات");
  return data;
 },[headers,token]);
 const load=useCallback(async()=>{
  try{
   const data=await call("list");
   setCars(data.cars||[]);
   setReadyMessage(data.readyMessage||"سيارتك جاهزة للاستلام من مغسلة سيارتك اللامعة.");
   setTruncated(!!data.truncated);
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"تعذر قراءة السيارات");}
 },[call]);
 useEffect(()=>{
  if(!open)return;
  void load();
  const timer=window.setInterval(()=>{if(!document.hidden&&navigator.onLine)void load();},25000);
  return()=>window.clearInterval(timer);
 },[open,load,refreshKey]);

 // The single share action has a ready-to-send image before it is pressed.
 // A real car photo is used if one exists; otherwise we share a branded ready card.
 useEffect(()=>{
  if(!open)return;
  try{
   const canvas=document.createElement("canvas");
   canvas.width=1200;canvas.height=630;
   const ctx=canvas.getContext("2d");
   if(!ctx)return;
   const grad=ctx.createLinearGradient(0,0,1200,630);
   grad.addColorStop(0,"#214bc5");grad.addColorStop(1,"#4296e6");
   ctx.fillStyle=grad;ctx.fillRect(0,0,1200,630);
   ctx.fillStyle="#ffffff";ctx.textAlign="center";ctx.direction="rtl";
   ctx.font="bold 58px sans-serif";ctx.fillText("مغسلة سيارتك اللامعة",600,165);
   ctx.font="bold 78px sans-serif";ctx.fillText("سيارتك جاهزة للاستلام",600,325);
   ctx.font="36px sans-serif";ctx.fillText("شكرًا لزيارتك، نسعد بخدمتك",600,425);
   const binary=atob(canvas.toDataURL("image/png").split(",")[1]);
   const bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   setBrandedImage(new File([bytes],"carwash-ready.png",{type:"image/png"}));
  }catch{/* Text-only fallback remains available. */}
 },[open]);

 // Prefetch actual photos silently, never requiring a separate preparation tap.
 useEffect(()=>{
  if(!open)return;
  const queue=cars.filter(car=>car.status==="ready"&&car.photoAvailable&&
   !preloadAttempted.current.has(car.id));
  for(const car of queue)preloadAttempted.current.add(car.id);
  if(!queue.length)return;
  let cancelled=false;
  const jobs=queue.slice();
  async function worker(){
   while(!cancelled){
    const car=jobs.shift();
    if(!car)return;
    try{
     const item=await call("photo",car.id);
     const response=await fetch(item.url,{cache:"no-store"});
     if(!response.ok)continue;
     const blob=await response.blob();
     const file=await imageForShare(new File([blob],"carwash-photo.jpg",{type:blob.type||"image/jpeg"}));
     if(!cancelled)setFiles(prev=>({...prev,[car.id]:file}));
    }catch{/* The branded image is a safe local fallback. */}
   }
  }
  for(let i=0;i<Math.min(3,jobs.length);i++)void worker();
  return()=>{cancelled=true;};
 },[open,cars,call]);

 async function action(car:Car,op:"ready"|"delivered"){
  if(busy)return;
  if(op==="delivered"&&!confirm("تأكيد تسليم السيارة؟"))return;
  setBusy(car.id);setError("");setNotice("");
  try{
   await call(op,car.id);
   setNotice(op==="ready"?"تم حفظ حالة جاهزية السيارة.":"تم توثيق التسليم.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"فشل تحديث حالة السيارة");}
  finally{setBusy("");}
 }
 async function upload(car:Car,original:File){
  if(busy)return;
  setBusy(car.id);setError("");setNotice("");
  try{
   const file=await imageForShare(original);
   const form=new FormData();
   form.append("entryId",car.id);
   if(token)form.append("token",token);
   form.append("photo",file);
   const result=await fetch("/api/worker-links/photo",{
    method:"POST",headers:await headers(false),
    body:form,credentials:"same-origin",cache:"no-store"
   });
   const json=await result.json().catch(()=>({}));
   if(!result.ok)throw Error(json.error||"تعذر حفظ الصورة");
   setFiles(v=>({...v,[car.id]:file}));
   setNotice("تم حفظ الصورة في التخزين الخاص؛ يمكنك مشاركتها الآن.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"فشل الصورة");}
  finally{setBusy("");}
 }
 async function share(car:Car){
  if(car.status!=="ready"||busy)return;
  const msg=readyMessage||"سيارتك جاهزة للاستلام من مغسلة سيارتك اللامعة.";
  const file=files[car.id]||brandedImage;
  const phone=car.phone?.replace(/^\+/,"")||"";
  setError("");setNotice("");
  try{
   if(typeof navigator.share==="function"&&file&&
       (!navigator.canShare||navigator.canShare({files:[file]}))){
    // Must invoke share synchronously from this one button click on iPhone.
    await navigator.share({title:"مغسلة سيارتك اللامعة",text:msg,files:[file]});
    void call("share_opened",car.id).catch(()=>{});
    setNotice("اختر واتساب ثم محادثة العميل وأكمل الإرسال. لا يمكن للموقع اختيار المستلم تلقائيًا عند مشاركة الصورة.");
    return;
   }
   // The WhatsApp deep link targets the customer's exact number, but
   // official click-to-chat links cannot attach a local image.
   if(phone){
    const address="https://wa.me/"+phone+"?text="+encodeURIComponent(msg);
    const opened=window.open(address,"_blank","noopener,noreferrer");
    if(!opened)window.location.assign(address);
    void call("share_opened",car.id).catch(()=>{});
    setNotice("فُتحت محادثة العميل مع الرسالة. هذا المتصفح لا يدعم إرفاق الصورة عبر رابط واتساب.");
    return;
   }
   if(typeof navigator.share==="function"){
    await navigator.share({title:"مغسلة سيارتك اللامعة",text:msg});
    void call("share_opened",car.id).catch(()=>{});
    setNotice("اختر العميل من قائمة المشاركة وأكمل الإرسال.");
   }else setError("أدخل رقم العميل أو افتح المشاركة من جوال يدعم واتساب.");
  }catch(e){
   if(e instanceof Error&&e.name==="AbortError")return;
   setError("تعذر فتح المشاركة؛ تأكد من صلاحيات المشاركة وتطبيق واتساب.");
  }
 }
 return <section className="card space-y-3" dir="rtl">
  <button type="button" className="w-full flex items-center justify-between text-start gap-2"
   aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   <span className="section-title mb-0">🚘 سيارات اليوم وحالة الجاهزية</span>
   <span className="txt-muted">{open?"إخفاء ▲":"عرض ▼"}</span>
  </button>
  {open&&<>
   <p className="txt-muted text-sm">السيارات في الأيام غير المعتمدة فقط. بعد اعتماد الموازنة تُحفظ في أرشيف المدير.</p>
   {truncated&&<p className="txt-warning text-sm">القائمة تعرض آخر 250 سيارة فقط؛ راجع أرشيف المدير عند الحاجة.</p>}
   {error&&<p className="txt-danger text-sm" role="alert">{error}</p>}
   {notice&&<p className="txt-cash text-sm" role="status">{notice}</p>}
   <button type="button" className="btn-secondary" onClick={()=>void load()}>تحديث القائمة</button>
   {cars.length===0?<p className="txt-muted text-sm">لا توجد سيارات نشطة الآن.</p>:
    <div className="space-y-3">{cars.map(car=><div key={car.id}
      className="rounded-xl p-3 border space-y-3" style={{borderColor:"var(--border)",background:"var(--surface-2)"}}>
     <div className="flex flex-wrap justify-between gap-2">
      <div className="min-w-0">
       <strong>{car.carType} — {car.serviceType}</strong>
       <p className="txt-muted text-xs">تاريخ {car.date} · الساعة {time(car.occurredAt)}</p>
      </div>
      <span className={car.status==="ready"?"txt-cash":car.status==="washing"?"txt-warning":"txt-muted"}>
       {statusText[car.status]}</span>
     </div>
     <div className="grid grid-cols-2 gap-2">
      {car.status==="washing"&&<button type="button" className="btn-primary col-span-2"
       disabled={busy===car.id} onClick={()=>void action(car,"ready")}>
       إبلاغ بالجاهزية</button>}
      {car.status==="ready"&&<>
       <button type="button" className="btn-primary col-span-2 py-3"
        disabled={!!busy} onClick={()=>void share(car)}>مشاركة الجاهزية</button>
       <button type="button" className="btn-secondary col-span-2"
        disabled={busy===car.id} onClick={()=>void action(car,"delivered")}>تم التسليم</button>
      </>}
     </div>
     {car.status==="ready"&&<details className="rounded-lg border p-2 text-sm" style={{borderColor:"var(--border)"}}>
      <summary className="cursor-pointer txt-muted">صورة السيارة الفعلية (اختياري)</summary>
      <label className="btn-secondary block mt-2 text-center cursor-pointer">
       📷 تصوير السيارة
       <input type="file" className="sr-only" accept="image/*" capture="environment"
        disabled={!!busy} onChange={e=>{
         const photo=e.currentTarget.files?.[0];
         if(photo)void upload(car,photo);
         e.currentTarget.value="";
        }}/>
      </label>
      <p className="txt-muted text-xs mt-2">عند عدم وجود صورة سيارة، تُشارك بطاقة جاهزية المغسلة المصممة تلقائيًا.</p>
     </details>}
    </div>)}</div>}
   <p className="txt-muted text-xs">زر واحد يجهز الصورة والرسالة للمشاركة. اختر واتساب والمستلم عند ظهور قائمة الجهاز؛ المشاركة لا تؤكد التسليم.</p>
  </>}
 </section>;
}
