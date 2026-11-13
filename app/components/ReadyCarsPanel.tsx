"use client";
import {useCallback,useEffect,useRef,useState} from "react";
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

/** A ready-to-share JPEG when no real car photo has been uploaded. */
function automaticReadyImage(car:Car):File{
 const canvas=document.createElement("canvas");
 canvas.width=1000;canvas.height=660;
 const ctx=canvas.getContext("2d");
 if(!ctx)throw Error("تعذر تجهيز صورة الجاهزية");
 const gradient=ctx.createLinearGradient(0,0,1000,660);
 gradient.addColorStop(0,"#082c4b");gradient.addColorStop(1,"#07538b");
 ctx.fillStyle=gradient;ctx.fillRect(0,0,1000,660);
 ctx.fillStyle="#dbf5ff";ctx.font="bold 43px system-ui";
 ctx.textAlign="center";ctx.fillText("مغسلة سيارتك اللامعة",500,94);
 ctx.font="124px system-ui";ctx.fillText("🚗",500,286);
 ctx.fillStyle="#ffffff";ctx.font="bold 54px system-ui";
 ctx.fillText("سيارتك جاهزة للاستلام",500,400);
 ctx.fillStyle="#d3eeff";ctx.font="30px system-ui";
 ctx.fillText(car.carType+" · "+car.serviceType,500,462);
 ctx.strokeStyle="#65b8e4";ctx.lineWidth=3;
 ctx.beginPath();ctx.moveTo(140,512);ctx.lineTo(860,512);ctx.stroke();
 ctx.font="27px system-ui";ctx.fillText("نشكركم على زيارتكم",500,569);
 const base64=canvas.toDataURL("image/jpeg",0.86).split(",")[1];
 const binary=atob(base64),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new File([bytes],"carwash-ready.jpg",{type:"image/jpeg"});
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
  const queue=cars.filter(car=>car.status!=="delivered"&&car.photoAvailable&&
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

 async function deliver(car:Car){
  if(busy||car.status==="delivered")return;
  setBusy(car.id);setError("");setNotice("");
  try{
   await call("delivered",car.id);
   setNotice(tt("ready.savedDelivered"));
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
   setNotice("تم حفظ الصورة.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"فشل الصورة");}
  finally{setBusy("");}
 }
 function share(car:Car){
  if(car.status==="delivered"||busy)return;
  setError("");setNotice("");
  // Native Web Share is the only browser-supported way to share JPEG plus
  // a caption. It cannot force WhatsApp or preselect the recipient.
  if(!navigator.share){setError(tt("ready.noSharing"));return;}
  let file:File;
  try{file=files[car.id]||automaticReadyImage(car);}
  catch{setError(tt("ready.imageError"));return;}
  if(navigator.canShare&&!navigator.canShare({files:[file]})){
   setError(tt("ready.noSharing"));return;
  }
  try{
   // Share must run inside the original user tap (iOS user activation).
   const pending=navigator.share({
    files:[file],
    text:readyMessage||"سيارتك جاهزة للاستلام من مغسلة سيارتك اللامعة.",
    title:"مغسلة سيارتك اللامعة"
   });
   void call("share_opened",car.id).then(()=>load())
    .catch(e=>setError(e instanceof Error?e.message:tt("error.cars")));
   void pending.then(()=>setNotice(tt("ready.shareClosed"))).catch(e=>{
    if(!(e instanceof Error&&e.name==="AbortError"))setError(tt("ready.imageError"));
   });
  }catch{setError(tt("ready.imageError"));}
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
     {car.status!=="delivered"&&<>
      <div className="grid grid-cols-2 gap-2" data-testid="direct-ready-actions">
       <button type="button" className="btn-primary py-3"
        disabled={!!busy} onClick={()=>share(car)}>{tt("ready.share")}</button>
       <button type="button" className="btn-secondary py-3"
        disabled={!!busy} onClick={()=>void deliver(car)}>{tt("ready.markDelivered")}</button>
      </div>
      <details className="rounded-lg border p-2 text-sm" style={{borderColor:"var(--border)"}}>
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
      </details>
     </>}
    </div>)}</div>}

  </>}
 </section>;
}
