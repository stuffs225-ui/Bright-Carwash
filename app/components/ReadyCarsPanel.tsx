"use client";
import {useCallback,useEffect,useState} from "react";
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
  if(car.status!=="ready")return;
  const msg=readyMessage||"سيارتك جاهزة للاستلام من مغسلة سيارتك اللامعة.";
  const file=files[car.id];
  const canShare=typeof navigator.share==="function";
  setError("");setNotice("");
  try{
   if(canShare){
    const payload:ShareData={text:msg,title:"مغسلة سيارتك اللامعة"};
    if(file&&(!navigator.canShare||navigator.canShare({files:[file]})))
     payload.files=[file];
    // Invocation is synchronous with the user's click to retain iOS activation.
    await navigator.share(payload);
    await call("share_opened",car.id).catch(()=>{});
    setNotice("فُتحت مشاركة الجهاز. هذا لا يثبت إرسال الرسالة أو وصولها.");
    if(file&&!payload.files)setNotice("المشاركة النصية تمت دون الصورة؛ أرفق الصورة من واتساب يدويًا.");
    return;
   }
   if(car.phone){
    const phone=car.phone.replace(/^\+/,"");
    const address="https://wa.me/"+phone+"?text="+encodeURIComponent(msg);
    const w=window.open(address,"_blank","noopener,noreferrer");
    if(!w){window.location.href=address;}
    void call("share_opened",car.id).catch(()=>{});
    setNotice(file
     ?"تم فتح محادثة واتساب للنص. أرفق الصورة من المعرض يدويًا."
     :"تم فتح محادثة واتساب. الإرسال يظل بقرار المستخدم.");
    return;
   }
   if(navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(msg);
    setNotice("نُسخت رسالة الجاهزية؛ افتح واتساب والصقها للمستلم.");
   }else setError("المشاركة غير مدعومة. انسخ نص الجاهزية يدويًا.");
  }catch(e){
   if(e instanceof Error&&e.name==="AbortError")return;
   setError("تعذرت المشاركة؛ يمكنك فتح محادثة العميل بالنص، وإرفاق الصورة يدويًا.");
  }
 }
 async function openWhatsApp(car:Car){
  if(!car.phone)return;
  const address="https://wa.me/"+car.phone.replace(/^\+/,"")+
   "?text="+encodeURIComponent(readyMessage);
  const opened=window.open(address,"_blank","noopener,noreferrer");
  if(!opened)window.location.href=address;
  void call("share_opened",car.id).catch(()=>{});
  setNotice("تم فتح رابط واتساب، وليس تأكيد إرسال رسالة.");
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
      {car.status==="washing"&&<button type="button" className="btn-primary"
       disabled={busy===car.id} onClick={()=>void action(car,"ready")}>
       إبلاغ بالجاهزية</button>}
      {car.status==="ready"&&<button type="button" className="btn-secondary"
       disabled={busy===car.id} onClick={()=>void action(car,"delivered")}>
       تم التسليم</button>}
      {car.status!=="delivered"&&<label className="btn-secondary text-center cursor-pointer">
       {busy===car.id?"جارٍ الحفظ...":car.photoAvailable?"تحديث صورة السيارة":"📷 تصوير السيارة"}
       <input type="file" className="sr-only" accept="image/*" capture="environment"
        disabled={!!busy} onChange={e=>{const f=e.currentTarget.files?.[0];
         if(f)void upload(car,f);e.currentTarget.value="";}}/>
      </label>}
     </div>
     {car.status==="ready"&&<>
      <button type="button" className="btn-primary w-full"
       onClick={()=>void share(car)}>مشاركة الجاهزية عبر واتساب</button>
      {car.phone&&<button type="button" className="btn-secondary w-full"
       onClick={()=>void openWhatsApp(car)}>فتح محادثة العميل بالنص</button>}
      {car.photoAvailable&&<button type="button" className="text-sm link-inline"
       onClick={async()=>{try{const d=await call("photo",car.id);
        window.open(d.url,"_blank","noopener,noreferrer");
       }catch(e){setError(e instanceof Error?e.message:"تعذر فتح الصورة");}}}>
       فتح الصورة المحفوظة (رابط مؤقت)</button>}
     </>}
    </div>)}</div>}
   <p className="txt-muted text-xs">مشاركة الجهاز لا تضمن اختيار واتساب أو إرسال المرفق. لا نسجل «تم الإرسال» أو «وصلت الرسالة» دون إثبات.</p>
  </>}
 </section>;
}
