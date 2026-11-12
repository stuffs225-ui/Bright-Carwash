"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {normalizeSaudiMobile} from "@/lib/phone";
import {supabase} from "@/lib/supabaseClient";
import {workerText,workerMessage,workerCarName,workerServiceName,workerDirection,workerTime,type WorkerLocale} from "@/lib/workerI18n";
type Car={id:string;carType:string;serviceType:string;date:string;occurredAt:string;
 cash:number;card:number;discount:number;phone:string|null;consent:boolean;
 status:"washing"|"ready"|"delivered";photoAvailable:boolean;readyAt:string|null;
 deliveredAt:string|null;shareRequestedAt:string|null};
const STATUS_KEYS={washing:"ready.washing",ready:"ready.ready",delivered:"ready.delivered"} as const;
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

export function ReadyCarsPanel({token,manager=false,locale="ar",refreshKey=0}:{
 token?:string;manager?:boolean;locale?:WorkerLocale;refreshKey?:number
}){
 const tt=(key:Parameters<typeof workerText>[1],vars?:Record<string,string|number>)=>workerText(locale,key,vars);
 const [open,setOpen]=useState(false);
 const [cars,setCars]=useState<Car[]>([]);
 const [readyMessage,setReadyMessage]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [files,setFiles]=useState<Record<string,File>>({});
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
    }catch{/* Photo sharing remains optional. */}
   }
  }
  for(let i=0;i<Math.min(3,jobs.length);i++)void worker();
  return()=>{cancelled=true;};
 },[open,cars,call]);

 async function action(car:Car,op:"ready"|"delivered"){
  if(busy)return;
  if(op==="delivered"&&!confirm(tt("ready.confirmDelivery")))return;
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
 function share(car:Car){
  if(car.status!=="ready"||busy)return;
  setError("");setNotice("");
  const phone=car.phone?normalizeSaudiMobile(car.phone):null;
  if(!phone){setError("لا يوجد رقم جوال صالح لهذه السيارة؛ يمكنك مشاركة الصورة منفصلًا عند الحاجة.");return;}
  const msg=readyMessage||"سيارتك جاهزة للاستلام من مغسلة سيارتك اللامعة.";
  // Navigate directly during the tap; opening a chat never confirms sending.
  void call("share_opened",car.id).catch(()=>{});
  window.location.assign("https://wa.me/"+phone.replace(/^\+/,"")+"?text="+encodeURIComponent(msg));
 }
 async function sharePhoto(car:Car){
  const file=files[car.id];
  if(!file||busy)return;
  setError("");setNotice("");
  try{
   if(!navigator.share||!navigator.canShare?.({files:[file]})){
    setError("مشاركة الصور غير متاحة في هذا المتصفح؛ افتح الصفحة من جوال يدعم مشاركة الملفات.");return;
   }
   await navigator.share({files:[file]});
   setNotice("أُغلقت نافذة مشاركة الصورة؛ لا يمكن التحقق من إرسالها إلى العميل.");
  }catch(e){if(!(e instanceof Error&&e.name==="AbortError"))setError("تعذرت مشاركة الصورة.");}
 }
 return <section className="card space-y-3" dir={workerDirection(locale)} lang={locale}>
  <button type="button" className="w-full flex items-center justify-between text-start gap-2"
   aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   <span className="section-title mb-0">{tt("ready.title")}</span>
   <span className="txt-muted">{open?tt("ready.hide"):tt("ready.show")}</span>
  </button>
  {open&&<>
   <p className="txt-muted text-sm">{tt("ready.archived")}</p>
   {truncated&&<p className="txt-warning text-sm">{tt("ready.truncated")}</p>}
   {error&&<p className="txt-danger text-sm" role="alert">{workerMessage(locale,error,"error.cars")}</p>}
   {notice&&<p className="txt-cash text-sm" role="status">{workerMessage(locale,notice,"ready.savedReady")}</p>}

   {cars.length===0?<p className="txt-muted text-sm">{tt("ready.none")}</p>:
    <div className="space-y-3">{cars.map(car=><div key={car.id}
      className="rounded-xl p-3 border space-y-3" style={{borderColor:"var(--border)",background:"var(--surface-2)"}}>
     <div className="flex flex-wrap justify-between gap-2">
      <div className="min-w-0">
       <strong>{workerCarName(locale,car.carType)} — {workerServiceName(locale,car.serviceType)}</strong>
       <p className="txt-muted text-xs">{tt("ready.date")} <bdi dir="ltr">{car.date}</bdi> · {tt("ready.time")} <bdi dir="ltr">{workerTime(car.occurredAt,locale)}</bdi></p>
      </div>
      <span className={car.status==="ready"?"txt-cash":car.status==="washing"?"txt-warning":"txt-muted"}>
       {tt(STATUS_KEYS[car.status])}</span>
     </div>
     <div className="grid grid-cols-2 gap-2">
      {car.status==="washing"&&<button type="button" className="btn-primary col-span-2"
       disabled={busy===car.id} onClick={()=>void action(car,"ready")}>
       {tt("ready.markReady")}</button>}
      {car.status==="ready"&&<>
       <button type="button" className="btn-primary col-span-2 py-3"
        disabled={!!busy} onClick={()=>void share(car)}>{tt("ready.share")}</button>
       <button type="button" className="btn-secondary col-span-2"
        disabled={busy===car.id} onClick={()=>void action(car,"delivered")}>{tt("ready.markDelivered")}</button>
      </>}
     </div>
     {car.status==="ready"&&<details className="rounded-lg border p-2 text-sm" style={{borderColor:"var(--border)"}}>
      <summary className="cursor-pointer txt-muted">{tt("ready.photoOptional")}</summary>
      <label className="btn-secondary block mt-2 text-center cursor-pointer">
       {tt("ready.capture")}
       <input type="file" className="sr-only" accept="image/*" capture="environment"
        disabled={!!busy} onChange={e=>{
         const photo=e.currentTarget.files?.[0];
         if(photo)void upload(car,photo);
         e.currentTarget.value="";
        }}/>
      </label>
      {files[car.id]&&<button type="button" className="btn-secondary w-full mt-2" disabled={!!busy} onClick={()=>void sharePhoto(car)}>{tt("ready.sharePhoto")}</button>}
     </details>}
    </div>)}</div>}

  </>}
 </section>;
}
