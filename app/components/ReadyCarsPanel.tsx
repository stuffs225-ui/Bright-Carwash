"use client";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {riyadhDayKey} from "@/lib/carwashCalendarDay";
import {workerText,workerMessage,workerCarName,workerServiceName,workerDirection,workerTime,type WorkerLocale} from "@/lib/workerI18n";
type Car={id:string;carType:string;serviceType:string;date:string;occurredAt:string;
 cash:number;card:number;discount:number;phone:string|null;consent:boolean;
 status:"washing"|"ready"|"delivered";photoAvailable:boolean;readyAt:string|null;
 deliveredAt:string|null;shareRequestedAt:string|null};
const STATUS_KEYS={washing:"ready.washing",ready:"ready.ready",delivered:"ready.delivered"} as const;
type Status="washing"|"ready"|"delivered";
type TodaySummary={today:string;cars:number;cash:number;card:number;crew:number;
 counts:Record<Status,number>;truncated:boolean;updatedAt:string;archived?:boolean};
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
 const [truncated,setTruncated]=useState(false);
 const [summary,setSummary]=useState<TodaySummary|null>(null);
 const [summaryError,setSummaryError]=useState("");
 const [filter,setFilter]=useState<"all"|Status>("all");
 const [scope,setScope]=useState<"today"|"unapproved">("today");
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
   credentials:"same-origin",cache:"no-store",keepalive:op==="share_opened"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"تعذر تحميل السيارات");
  return data;
 },[headers,token]);
 const loadSummary=useCallback(async()=>{
  try{
   const data=await call("today_summary");
   if(data?.ok===true&&data.counts&&typeof data.today==="string"){
    setSummary(data as TodaySummary);setSummaryError("");
   }
  }catch(e){setSummaryError(e instanceof Error?e.message:"تعذر تحديث ملخص اليوم");}
 },[call]);
 useEffect(()=>{
  void loadSummary();
  const timer=window.setInterval(()=>{
   if(!document.hidden&&navigator.onLine)void loadSummary();
  },20000);
  return()=>window.clearInterval(timer);
 },[loadSummary,refreshKey]);
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

 async function deliver(car:Car){
  if(busy||car.status==="delivered")return;
  setBusy(car.id);setError("");setNotice("");
  try{
   await call("delivered",car.id);
   setNotice(workerText("ar","ready.savedDelivered"));
   await load();void loadSummary();
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
   setNotice("تم حفظ الصورة.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"فشل الصورة");}
  finally{setBusy("");}
 }
 function share(car:Car){
  if(car.status==="delivered"||busy)return;
  setError("");setNotice("");
  const phone=(car.phone||"").replace(/\D/g,"");
  if(!/^9665\d{8}$/.test(phone)){
   setError("لا يوجد رقم جوال سعودي صالح لهذه السيارة؛ لا يمكن فتح محادثة العميل.");return;
  }
  // WhatsApp deep link opens the stored customer's conversation with text.
  // Sending and photo attachment are manual and cannot be verified by a browser.
  const text=readyMessage||"سيارتك جاهزة للاستلام من مغسلة سيارتك اللامعة.";
  const url="https://wa.me/"+phone+"?text="+encodeURIComponent(text);
  const popup=window.open(url,"_blank");
  if(popup)popup.opener=null;
  // Log only an attempted share, even if WhatsApp is canceled.
  void call("share_opened",car.id).then(()=>{
   setNotice("تم تسجيل محاولة مشاركة الجاهزية؛ إرسال الرسالة غير مؤكد. يمكنك إضافة الصورة يدويًا من واتساب.");
   void load();void loadSummary();
   if(!popup)window.location.assign(url);
  }).catch(err=>setError(err instanceof Error?err.message:tt("error.cars")));
 }
 const today=summary?.today||riyadhDayKey(new Date());
 const visibleCars=cars.filter(c=>(scope==="unapproved"||c.date===today)&&
  (filter==="all"||c.status===filter));
 return <section className="card space-y-3" dir={workerDirection(locale)} lang={locale} data-testid="today-operations-center">
  <button type="button" className="w-full flex items-center justify-between text-start gap-2"
   aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   <span className="section-title mb-0">{tt("ready.title")}</span>
   <span className="txt-muted">{open?tt("ready.hide"):tt("ready.show")}</span>
  </button>
  {summary&&<div className="space-y-3" data-testid="today-status-summary">
   <div className="grid grid-cols-3 gap-2">
    {(["washing","ready","delivered"] as Status[]).map(status=>
     <button type="button" key={status} className="rounded-xl border p-2 text-center"
      style={{borderColor:filter===status?"var(--brand)":"var(--border)",background:"var(--surface-2)"}}
      onClick={()=>{setFilter(status);setScope("today");setOpen(true);}}>
      <strong className="block text-xl" dir="ltr">{summary.counts[status]||0}</strong>
      <span className="text-xs block">{tt(STATUS_KEYS[status])}</span>
     </button>)}
   </div>
   <div className="grid grid-cols-3 gap-2 text-center">
    {([{label:tt("days.cash"),value:summary.cash},
      {label:tt("days.pos"),value:summary.card},
      {label:tt("days.crew"),value:summary.crew}] as const).map(row=>
       <div key={row.label} className="rounded-lg p-2" style={{background:"var(--surface-3)"}}>
        <span className="txt-muted text-xs block">{row.label}</span>
        <strong className="text-sm" dir="ltr">{manager?new Intl.NumberFormat("ar-SA-u-nu-latn",{maximumFractionDigits:2}).format(row.value):String(row.value)} {locale==="ar"?"ر.س":"SAR"}</strong>
       </div>)}
   </div>
   {summary.truncated&&<p className="txt-warning text-xs" role="status">{tt("ready.countsLimited")}</p>}
  </div>}
  {summaryError&&<p className="txt-warning text-xs" role="status">{workerMessage(locale,summaryError,"error.cars")}</p>}
  {open&&<>
   <div className="flex flex-wrap gap-2">
    <button type="button" className={scope==="today"?"btn-primary text-xs":"btn-secondary text-xs"}
     onClick={()=>setScope("today")}>{tt("ready.todayOnly")}</button>
    <button type="button" className={scope==="unapproved"?"btn-primary text-xs":"btn-secondary text-xs"}
     onClick={()=>setScope("unapproved")}>{tt("ready.allUnapproved")}</button>
   </div>
   <div className="flex flex-wrap gap-1">
    <button type="button" className={filter==="all"?"btn-primary text-xs":"btn-secondary text-xs"}
     onClick={()=>setFilter("all")}>{tt("ready.statusAll")}</button>
    {(["washing","ready","delivered"] as Status[]).map(status=>
     <button key={status} type="button" className={filter===status?"btn-primary text-xs":"btn-secondary text-xs"}
      onClick={()=>setFilter(status)}>{tt(STATUS_KEYS[status])}</button>)}
   </div>
   <p className="txt-muted text-xs">{tt("ready.archived")}</p>
   {truncated&&<p className="txt-warning text-sm">{tt("ready.truncated")}</p>}
   {error&&<p className="txt-danger text-sm" role="alert">{workerMessage(locale,error,"error.cars")}</p>}
   {notice&&<p className="txt-cash text-sm" role="status">{workerMessage(locale,notice,"ready.savedReady")}</p>}

   {visibleCars.length===0?<p className="txt-muted text-sm">{tt("ready.statusMissing")}</p>:
    <div className="space-y-3">{visibleCars.map(car=><div key={car.id}
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
