"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {storeWorkerCatalog,loadWorkerCatalog,queueWorkerRecord,listWorkerRecords,deleteWorkerRecord,type WorkerSubmission} from "@/lib/workerOfflineQueue";
import {normalizeSaudiMobile} from "@/lib/phone";
import {supabase} from "@/lib/supabaseClient";
import {WorkerDailySummary} from "@/app/components/WorkerDailySummary";
import {ReadyCarsPanel} from "./ReadyCarsPanel";

type Preset={id:string;car_type:string;service_type:string;amount:number;sort_order?:number};
type Addon={id:string;name:string;price:number};
type Catalog={label:string;presets:Preset[];addons:Addon[];
 discountLimit?:number;manualServiceEnabled?:boolean;manualAddonEnabled?:boolean};
const sar=(value:number)=>new Intl.NumberFormat("ar-SA",{maximumFractionDigits:2,minimumFractionDigits:2}).format(value)+" ر.س";
const rounded=(n:number)=>Math.round(n*100)/100;

export function CarRegistrationScreen({token="",manager=false}:{token?:string;manager?:boolean}){
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [invalid,setInvalid]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [presetId,setPresetId]=useState("");
 const [carType,setCarType]=useState("");
 const [showMoreServices,setShowMoreServices]=useState(false);
 const [manualMode,setManualMode]=useState(false);
 const [manualService,setManualService]=useState("");
 const [manualPrice,setManualPrice]=useState("");
 const [manualAddons,setManualAddons]=useState<{name:string;price:number}[]>([]);
 const [manualAddonName,setManualAddonName]=useState("");
 const [manualAddonPrice,setManualAddonPrice]=useState("");
 const [priceReason,setPriceReason]=useState("");
 const managerPending=useRef<{fingerprint:string;id:string}|null>(null);
 const [selectedAddons,setSelectedAddons]=useState<string[]>([]);
 const [method,setMethod]=useState<"cash"|"card"|"mixed">("cash");
 const [discount,setDiscount]=useState("0");
 const [showDiscount,setShowDiscount]=useState(false);
 const [queued,setQueued]=useState(0);
 const [syncing,setSyncing]=useState(false);
 const [cash,setCash]=useState("");
 const [card,setCard]=useState("");
 const [customerPhone,setCustomerPhone]=useState("");
 const [consent,setConsent]=useState(false);
 const [notes,setNotes]=useState("");
 const [status,setStatus]=useState("");
 const [summaryVersion,setSummaryVersion]=useState(0);
 const [error,setError]=useState("");
 const syncActive=useRef(false);
 const safeToken=manager||/^[a-f0-9]{64}$/.test(token);

 useEffect(()=>{
  let cancelled=false;
  async function load(){
   setLoading(true);
   try{
    const headers:Record<string,string>={"content-type":"application/json"};
    if(manager){
     const {data:{session}}=await supabase.auth.getSession();
     if(!session)throw Error("جلسة المدير غير متاحة");
     headers.authorization="Bearer "+session.access_token;
    }
    const res=await fetch("/api/worker-links/catalog",{
     method:"POST",headers,body:JSON.stringify(manager?{}:{token}),cache:"no-store"
    });
    const info=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(info.error||"الرابط غير صالح");
    if(!cancelled){
     setCatalog(info);
     if(info.presets?.length){
      const last=typeof window!=="undefined"?localStorage.getItem("carwash_last_car_type_v1"):null;
      const first=info.presets.find((p:Preset)=>p.car_type===last)||info.presets[0];
      setPresetId(first.id);setCarType(first.car_type);
     }
     if(!manager)void storeWorkerCatalog(token,info).catch(()=>setError("التخزين الآمن غير متاح على هذا الجهاز؛ يلزم الإنترنت عند التسجيل."));
    }
   }catch(e){
    const fallback=manager?null:await loadWorkerCatalog(token).catch(()=>null);
    if(!cancelled){
     if(fallback){setCatalog(fallback);if(fallback.presets?.length){setPresetId(fallback.presets[0].id);setCarType(fallback.presets[0].car_type);}
      setStatus("أنت دون اتصال: الأسعار المحفوظة مؤقتة، وسيُراجعها السيرفر عند المزامنة.");}
     else setInvalid(e instanceof Error?e.message:"تعذر فتح الرابط");
    }
   }
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[token,manager]);

 useEffect(()=>{
  if(manager)return;
  document.documentElement.classList.add("touch-mode");
  return()=>document.documentElement.classList.remove("touch-mode");
 },[]);
 useEffect(()=>{
  if(manager||!safeToken||!("serviceWorker" in navigator))return;
  void navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>{});
 },[safeToken,manager]);

 const replay=useCallback(async()=>{
  if(manager||syncActive.current||!navigator.onLine)return {sent:0,remaining:queued,blocked:0};
  syncActive.current=true;setSyncing(true);
  let sent=0,blocked=0;
  try{
   const rows=await listWorkerRecords(token);
   for(const row of rows){
    try{
     const response=await fetch("/api/worker-links/record",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({...row.payload,token}),cache:"no-store"
     });
     if(response.ok){await deleteWorkerRecord(row.id);sent++;continue;}
     if(response.status===429||response.status>=500)break;
     blocked++;
     // Rejected items are never discarded automatically: owner can review.
    }catch{break;}
   }
   const remaining=(await listWorkerRecords(token)).length;
   setQueued(remaining);
   if(blocked)setError("هناك تسجيلات معلقة رُفضت من السيرفر. اطلب من المدير مراجعة الرابط أو السعر؛ لم تُحذف البيانات.");
   if(sent){setSummaryVersion(v=>v+1);if(remaining===0)setStatus("تمت مزامنة جميع السيارات المحفوظة بنجاح.");}
   return {sent,remaining,blocked};
  }finally{syncActive.current=false;setSyncing(false);}
 },[token,queued,manager]);
 useEffect(()=>{
  if(manager)return;
  let active=true;
  void listWorkerRecords(token).then(rows=>{if(active)setQueued(rows.length);if(navigator.onLine)void replay();})
   .catch(()=>{if(active)setError("تعذر قراءة السجل المحلي المشفر.");});
  const onOnline=()=>{void replay();};
  window.addEventListener("online",onOnline);
  return()=>{active=false;window.removeEventListener("online",onOnline);};
 },[token,replay,manager]);

 const preset=catalog?.presets.find(p=>p.id===presetId);
 const allCarTypes=Array.from(new Set((catalog?.presets||[]).map(p=>p.car_type)));
 const filteredPresets=(catalog?.presets||[]).filter(p=>p.car_type===(carType||preset?.car_type));
 const manualServiceAllowed=manager||catalog?.manualServiceEnabled!==false;
 const manualAddonAllowed=manager||catalog?.manualAddonEnabled!==false;
 const useException=manualMode||manualAddons.length>0;
 const totalAddons=useMemo(()=>(catalog?.addons||[])
  .filter(a=>selectedAddons.includes(a.id)).reduce((v,a)=>v+Number(a.price),0),
 [catalog,selectedAddons]);
 const manualExtras=manualAddons.reduce((a,b)=>a+b.price,0);
 const discountNumber=Number(discount)||0;
 const basePrice=manualMode?Number(manualPrice||0):Number(preset?.amount||0);
 const price=rounded(basePrice+totalAddons+manualExtras-discountNumber);
 useEffect(()=>{
  if(!preset&&!manualMode)return;
  if(method==="cash"){setCash(String(price));setCard("0");}
  else if(method==="card"){setCash("0");setCard(String(price));}
  else{
   const half=rounded(price/2);
   setCash(String(half));setCard(String(rounded(price-half)));
  }
 },[price,method,presetId]);

 async function submit(e:React.FormEvent){
  e.preventDefault();setError("");setStatus("");
  if(!catalog||busy||(!preset&&!manualMode))return;
  if(useException&&!manualServiceAllowed){setError("السعر الاستثنائي معطل في الإعدادات");return;}
  if(manualAddons.length&&!manualAddonAllowed){setError("الإضافات المخصصة معطلة في الإعدادات");return;}
  if(useException&&priceReason.trim().length<3){setError("اكتب سبب الخدمة أو السعر الاستثنائي");return;}
  if(manualMode&&(manualService.trim().length<2||!Number.isFinite(basePrice)||basePrice<=0||basePrice>5000)){
   setError("اسم الخدمة أو سعرها الاستثنائي غير صحيح");return;
  }
  const c=Number(cash),d=Number(card),discountValue=Number(discount);
  if(!Number.isFinite(c)||!Number.isFinite(d)||c<0||d<0||
     !Number.isFinite(discountValue)||discountValue<0||discountValue>Number(catalog.discountLimit??10)||
     rounded(c+d)!==price){
   setError("راجع مبلغ الكاش والشبكة والخصم؛ مجموع الدفع يجب أن يطابق السعر النهائي.");return;
  }
  const phone=customerPhone.trim()?normalizeSaudiMobile(customerPhone):null;
  if(customerPhone.trim()&&!phone){setError("رقم جوال العميل غير صحيح. يمكنك تركه فارغًا.");return;}
  if(phone&&!consent){setError("يجب تأكيد موافقة العميل قبل استخدام جواله لواتساب، أو اترك الرقم فارغًا.");return;}
  const basis={
   presetId,addons:[...selectedAddons],cash:c,card:d,discount:discountValue,
   notes,customerPhone:phone,whatsappConsent:!!phone&&consent,
   ...(useException?{oneTime:{enabled:true as const,carType:carType||preset?.car_type||"",
    service:manualMode?manualService.trim():preset?.service_type||"",
    price:rounded(basePrice),addons:[...manualAddons],reason:priceReason.trim()}}:{})
  };
  const fingerprint=JSON.stringify(basis);
  const id=manager&&managerPending.current?.fingerprint===fingerprint
   ?managerPending.current.id:crypto.randomUUID();
  if(manager)managerPending.current={fingerprint,id};
  const payload:WorkerSubmission={...basis,mutationId:id};
  setBusy(true);
  try{
   if(manager){
    if(!navigator.onLine)throw Error("لا يمكن تسجيل سيارة من لوحة المدير أثناء انقطاع الإنترنت");
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw Error("جلسة الإدارة غير متاحة، افتح رابط المدير");
    const response=await fetch("/api/worker-links/record",{
     method:"POST",headers:{"content-type":"application/json",
      authorization:"Bearer "+session.access_token},
     body:JSON.stringify(payload),credentials:"same-origin",cache:"no-store"
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||"تعذر تسجيل السيارة");
    managerPending.current=null;
    setSummaryVersion(v=>v+1);
    setStatus("تم تسجيل السيارة من لوحة المدير بنجاح.");
    setNotes("");setSelectedAddons([]);setDiscount("0");setShowDiscount(false);
   setManualMode(false);setManualAddons([]);setPriceReason("");
    setManualMode(false);setManualAddons([]);setPriceReason("");
    setCustomerPhone("");setConsent(false);setMethod("cash");
    window.scrollTo({top:0,behavior:"smooth"});
    return;
   }
   // Write ahead: every submission is an immutable encrypted outbox item BEFORE network IO.
   // Retrying after an uncertain response reuses the same UUID and cannot double-book.
   await queueWorkerRecord(token,payload);
   setQueued((await listWorkerRecords(token)).length);
   setStatus("العملية محفوظة مشفرة على هذا الجهاز؛ ستُرسل إلى السيرفر عند الاتصال.");
   setNotes("");setSelectedAddons([]);setDiscount("0");setShowDiscount(false);
   setCustomerPhone("");setConsent(false);setMethod("cash");
   if(navigator.onLine){
    const result=await replay();
    if(result.remaining===0&&result.blocked===0)setStatus("تم تسجيل السيارة بنجاح.");
    else setStatus("التسجيل محفوظ على الجهاز ولم يتأكد وصوله بعد. لا تحذفه.");
   }
   window.scrollTo({top:0,behavior:"smooth"});
  }catch(e){
   setError(manager
    ?e instanceof Error?e.message:"تعذر تسجيل السيارة"
    :"تعذر الحفظ الآمن على هذا الجهاز. لم تُسجل السيارة؛ لا تغلق الصفحة قبل مراجعة اتصال الجهاز.");
  }finally{setBusy(false);}
 }
 return <main className="min-h-screen px-3 sm:px-4 py-6 max-w-3xl mx-auto space-y-4" dir="rtl">
  <header className="card text-center space-y-2">
   <h1 className="section-title">🚗 تسجيل السيارات {manager?"— الإدارة":""}</h1>
   <p className="txt-muted text-sm">مغسلة سيارتك اللامعة</p>
   {catalog&&<p className="text-sm font-bold">{catalog.label}</p>}
  </header>
  {safeToken&&!invalid&&<WorkerDailySummary token={manager?undefined:token} manager={manager} refreshKey={summaryVersion}/>}
  {!manager&&queued>0&&<section className="card space-y-2" role="status">
    <p className="font-bold">عمليات بانتظار المزامنة: {queued}</p>
    <p className="txt-muted text-sm">محفوظة مشفرة على نفس هذا الجهاز. لا تحذف بيانات Safari قبل إتمام المزامنة. قد تُرفض أسعار قديمة عند العودة للإنترنت.</p>
    <button type="button" className="btn-secondary w-full" disabled={syncing||!navigator.onLine} onClick={()=>void replay()}>{syncing?"جارٍ المزامنة":"إعادة المزامنة الآن"}</button>
   </section>}
  {loading?<section className="card text-center">جارٍ فتح نموذج تسجيل السيارات...</section>:
   invalid?<section className="card"><p className="txt-danger">{invalid}</p>
    <p className="txt-muted text-sm mt-2">اطلب رابطًا جديدًا من مدير المغسلة.</p></section>:
  <form onSubmit={submit} className="card space-y-4">
   {status&&<p className="rounded-lg p-3 text-sm" style={{background:"var(--tone-green-bg)",color:"var(--tone-green-fg)"} } role="status">{status}</p>}
   {error&&<p className="txt-danger text-sm" role="alert">{error}</p>}
   <label className="form-label">نوع السيارة والخدمة
    <select value={presetId} onChange={e=>setPresetId(e.target.value)} required>
     {(catalog?.presets||[]).map(p=><option key={p.id} value={p.id}>{p.car_type} — {p.service_type} ({sar(Number(p.amount))})</option>)}
    </select>
   </label>
   {(catalog?.addons.length||0)>0&&<div className="space-y-2">
    <p className="form-label">خدمات إضافية (اختياري)</p>
    {catalog?.addons.map(a=><label key={a.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
     <span><input type="checkbox" checked={selectedAddons.includes(a.id)}
      onChange={e=>setSelectedAddons(v=>e.target.checked?[...v,a.id]:v.filter(z=>z!==a.id))}/> {a.name}</span>
     <span>{sar(Number(a.price))}</span>
    </label>)}
   </div>}
   <div className="space-y-2">
    <button type="button" className="btn-secondary w-full" onClick={()=>{setShowDiscount(v=>!v);setDiscount("0");}}>{showDiscount?"إلغاء الخصم":"إضافة خصم (اختياري)"}</button>
    {showDiscount&&<label className="form-label">الخصم (من 0 إلى 10 ريالات)
     <input type="number" inputMode="decimal" min="0" max="10" step=".01"
      value={discount} onChange={e=>setDiscount(e.target.value)} required/>
    </label>}
   </div>
   <div className="space-y-2">
    <p className="form-label">طريقة الدفع</p>
    <div className="grid grid-cols-3 gap-2">
     {(["cash","card","mixed"] as const).map(x=>
      <button type="button" key={x} className={method===x?"btn-primary":"btn-secondary"}
       onClick={()=>setMethod(x)}>{x==="cash"?"كاش":x==="card"?"شبكة":"مختلط"}</button>)}
    </div>
   </div>
   {method==="mixed"&&<div className="grid grid-cols-2 gap-3">
    <label className="form-label">المبلغ كاش
     <input type="number" inputMode="decimal" min="0" step=".01" value={cash}
      onChange={e=>setCash(e.target.value)}/>
    </label>
    <label className="form-label">المبلغ شبكة
     <input type="number" inputMode="decimal" min="0" step=".01" value={card}
      onChange={e=>setCard(e.target.value)}/>
    </label>
   </div>}
   <div className="rounded-xl p-3 flex items-center justify-between" style={{background:"var(--surface-3)",color:"var(--text)"}}>
    <span>الإجمالي بعد الخصم</span><strong className="text-xl">{sar(Math.max(0,price))}</strong>
   </div>
   <details className="border rounded-lg p-3">
    <summary className="cursor-pointer font-semibold">معلومات إضافية (اختيارية)</summary>
    <div className="space-y-3 pt-3">
     <label className="form-label">ملاحظات
      <input type="text" maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}
       placeholder="ملاحظات عن السيارة"/>
     </label>
     <label className="form-label">رقم جوال العميل (اختياري — للجاهزية فقط)
      <input type="tel" inputMode="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}
       placeholder="05XXXXXXXX"/>
     </label>
     {customerPhone&&<label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
      <span>وافق العميل على استخدام رقمه لاستلام إشعار جاهزية واتساب.</span>
     </label>}
    </div>
   </details>
   <button className="btn-primary w-full py-4 text-lg" type="submit" disabled={busy||!preset}>
    {busy?"جارٍ حفظ العملية...":"تسجيل السيارة"}
   </button>
   <p className="txt-muted text-xs text-center">{manager?"يسجل المدير بنفس قائمة الخدمات والأسعار التي تظهر للعامل، مع عرض الأيام غير المعتمدة.":"لا يحتاج هذا الرابط إيميل أو حساب أو كلمة مرور. يتيح تسجيل السيارات فقط. يمكنك الحفظ أثناء انقطاع الشبكة بعد فتح الصفحة مرة واحدة؛ يثبت التسجيل في النظام بعد نجاح المزامنة."}</p>
  </form>}
 </main>;
}
