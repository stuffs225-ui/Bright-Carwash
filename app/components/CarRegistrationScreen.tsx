"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {storeWorkerCatalog,loadWorkerCatalog,queueWorkerRecord,listWorkerRecords,deleteWorkerRecord,storeWorkerDraft,loadWorkerDraft,deleteWorkerDraft,type WorkerSubmission,type WorkerDraft} from "@/lib/workerOfflineQueue";
import {normalizeSaudiMobile} from "@/lib/phone";
import {supabase} from "@/lib/supabaseClient";
import {WorkerDailySummary} from "@/app/components/WorkerDailySummary";
import {ReadyCarsPanel} from "./ReadyCarsPanel";
import {workerText,workerCarName,workerServiceName,workerAddonName,workerMessage,workerMoney,readWorkerLocale,persistWorkerLocale,workerDirection,type WorkerLocale,type WorkerKey} from "@/lib/workerI18n";

type Preset={id:string;car_type:string;service_type:string;amount:number;sort_order?:number};
type Addon={id:string;name:string;price:number};
type Catalog={label:string;presets:Preset[];addons:Addon[];
 discountLimit?:number;manualServiceEnabled?:boolean;manualAddonEnabled?:boolean};
const sar=(value:number)=>new Intl.NumberFormat("ar-SA-u-nu-latn",{maximumFractionDigits:2,minimumFractionDigits:2}).format(value)+" ر.س";
const rounded=(n:number)=>Math.round(n*100)/100;

export function CarRegistrationScreen({token="",manager=false,managerUserId=""}:{token?:string;manager?:boolean;managerUserId?:string}){
 // Stable per-manager namespace, not an authorization credential.
 // Outbox records are encrypted using a random non-extractable device key.
 const outboxKey=manager
  ? (/^[0-9a-f-]{36}$/i.test(managerUserId)?managerUserId.toLowerCase().replace(/-/g,"").padEnd(64,"0"):"")
  :token;
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [language,setLanguage]=useState<WorkerLocale>("ha-NG");
 const locale:WorkerLocale=manager?"ar":language;
 const tt=(key:WorkerKey,vars?:Record<string,string|number>)=>workerText(locale,key,vars);
 const money=(value:number)=>manager?sar(value):workerMoney(value);
 useEffect(()=>{
  if(manager)return;
  const saved=readWorkerLocale();
  setLanguage(saved);
  document.documentElement.lang=saved;
  document.documentElement.dir=workerDirection(saved);
  document.documentElement.removeAttribute("data-worker-lang-pending");
 },[manager]);
 function selectLanguage(lang:WorkerLocale){
  if(manager)return;
  setLanguage(lang);persistWorkerLocale(lang);
  document.documentElement.lang=lang;
  document.documentElement.dir=workerDirection(lang);
 }
 const [invalid,setInvalid]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [draftReady,setDraftReady]=useState(false);
 const [presetId,setPresetId]=useState("");
 const [carType,setCarType]=useState("");
 const [showMoreServices,setShowMoreServices]=useState(false);
 const [manualMode,setManualMode]=useState(false);
 const [manualService,setManualService]=useState("");
 const [manualPrice,setManualPrice]=useState("");
 const [priceReason,setPriceReason]=useState("");

 const [selectedAddons,setSelectedAddons]=useState<string[]>([]);
 const [method,setMethod]=useState<"cash"|"card"|"mixed">("cash");
 const [discount,setDiscount]=useState("0");
 const [showDiscount,setShowDiscount]=useState(false);
 const [queued,setQueued]=useState(0);
 const [syncing,setSyncing]=useState(false);
 const [cash,setCash]=useState("");
 const [card,setCard]=useState("");
 const [customerPhone,setCustomerPhone]=useState("");
 const [notes,setNotes]=useState("");
 const [status,setStatus]=useState("");
 const [summaryVersion,setSummaryVersion]=useState(0);
 const [error,setError]=useState("");
 const syncActive=useRef(false);
 const savingNow=useRef(false);
 const skipRestoredPayment=useRef(false);
 // Keep the same idempotency key if online direct submission has an uncertain outcome.
 const directPending=useRef<WorkerSubmission|null>(null);
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
      let lastPayment:string|null=null;
      try{lastPayment=localStorage.getItem("carwash_last_payment_v1");}catch{}
      setPresetId("");setCarType("");
      if(lastPayment==="cash"||lastPayment==="card"||lastPayment==="mixed")setMethod(lastPayment);
     }
     if(outboxKey)void storeWorkerCatalog(outboxKey,info).catch(()=>setError("التخزين الآمن غير متاح على هذا الجهاز؛ يلزم الإنترنت عند التسجيل."));
    }
   }catch(e){
    const fallback=outboxKey?await loadWorkerCatalog(outboxKey).catch(()=>null):null;
    if(!cancelled){
     if(fallback){setCatalog(fallback);setStatus("أنت دون اتصال. التسجيلات ستُزامن تلقائيًا.");}
     else setInvalid(e instanceof Error?e.message:"تعذر فتح الرابط");
    }
   }
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[token,manager,outboxKey]);

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
  if(!outboxKey||syncActive.current||!navigator.onLine)return {sent:0,remaining:queued,blocked:0};
  syncActive.current=true;setSyncing(true);
  let sent=0,blocked=0;
  try{
   const rows=await listWorkerRecords(outboxKey);
   let bearer="";
   if(manager){
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw Error("جلسة المدير غير متاحة حاليًا؛ العمليات محفوظة محليًا");
    bearer=session.access_token;
   }
   for(const row of rows){
    try{
     const response=await fetch("/api/worker-links/record",{
      method:"POST",headers:{"content-type":"application/json",
       ...(manager?{authorization:"Bearer "+bearer}:{})},
      body:JSON.stringify({...row.payload,...(manager?{}:{token})}),cache:"no-store"
     });
     if(response.ok){await deleteWorkerRecord(row.id);sent++;continue;}
     if(response.status===429||response.status>=500)break;
     blocked++;
     // Rejected items are never discarded automatically: owner can review.
    }catch{break;}
   }
   const remaining=(await listWorkerRecords(outboxKey)).length;
   setQueued(remaining);
   if(blocked)setError("هناك تسجيلات معلقة رُفضت من السيرفر. اطلب من المدير مراجعة الرابط أو السعر؛ لم تُحذف البيانات.");
   if(sent){
    setSummaryVersion(v=>v+1);
    window.dispatchEvent(new Event("carwash:data-changed"));
    if(remaining===0)setStatus("تم تسجيل السيارة بنجاح.");
   }
   return {sent,remaining,blocked};
  }catch(e){
   setError(e instanceof Error?e.message:"فشلت المزامنة، ولا تزال العمليات محفوظة محليًا.");
   return {sent,remaining:queued,blocked:0};
  }finally{syncActive.current=false;setSyncing(false);}
 },[token,queued,manager,outboxKey]);
 useEffect(()=>{
  if(!outboxKey)return;
  let active=true;
  void listWorkerRecords(outboxKey).then(rows=>{if(active)setQueued(rows.length);if(navigator.onLine)void replay();})
   .catch(()=>{if(active)setError("تعذر قراءة السجل المحلي المشفر.");});
  const onOnline=()=>{void replay();};
  window.addEventListener("online",onOnline);
  return()=>{active=false;window.removeEventListener("online",onOnline);};
 },[outboxKey,replay]);

 // Restore draft once the active price catalog is loaded, before a blank save can occur.
 useEffect(()=>{
  let active=true;
  setDraftReady(false);
  if(!catalog)return()=>{active=false;};
  if(!outboxKey){setDraftReady(true);return()=>{active=false;};}
  void loadWorkerDraft(outboxKey).then(draft=>{
   if(!active)return;
   if(draft){
    if(catalog.presets.some(p=>p.id===draft.presetId)){
     setPresetId(draft.presetId);setCarType(draft.carType);
    }else if(draft.carType==="شاحنة"||catalog.presets.some(p=>p.car_type===draft.carType)){
     setCarType(draft.carType);setPresetId("");
    }
    const manualAllowed=manager||catalog.manualServiceEnabled!==false;
    setManualMode(Boolean(draft.manualMode&&manualAllowed));
    setManualService(String(draft.manualService||"").slice(0,80));
    setManualPrice(String(draft.manualPrice||"").slice(0,20));
    setPriceReason(String(draft.priceReason||"").slice(0,300));
    setSelectedAddons((Array.isArray(draft.selectedAddons)?draft.selectedAddons:[])
     .filter(id=>catalog.addons.some(a=>a.id===id)));
    setDiscount(String(draft.discount??"0").slice(0,20));
    setShowDiscount(Boolean(draft.showDiscount));
    if(draft.method==="cash"||draft.method==="card"||draft.method==="mixed")
     setMethod(draft.method);
    setCash(String(draft.cash||"").slice(0,20));
    setCard(String(draft.card||"").slice(0,20));
    setCustomerPhone(String(draft.customerPhone||"").slice(0,24));
    setNotes(String(draft.notes||"").slice(0,500));
    skipRestoredPayment.current=true;
   }
   setDraftReady(true);
  }).catch(()=>{if(active)setDraftReady(true);});
  return()=>{active=false;};
 },[catalog,outboxKey,manager]);
 useEffect(()=>{
  if(!catalog||!draftReady||busy||!outboxKey)return;
  const meaningful=Boolean(carType||presetId||customerPhone.trim()||notes.trim()||manualMode||
   selectedAddons.length||showDiscount||method==="mixed");
  const draft:WorkerDraft={presetId,carType,manualMode,manualService,manualPrice,
   priceReason,selectedAddons,method,discount,showDiscount,cash,card,customerPhone,notes};
  const timer=window.setTimeout(()=>{
   void (meaningful?storeWorkerDraft(outboxKey,draft):deleteWorkerDraft(outboxKey)).catch(()=>{});
  },350);
  return()=>window.clearTimeout(timer);
 },[catalog,draftReady,busy,outboxKey,presetId,carType,manualMode,manualService,
  manualPrice,priceReason,selectedAddons,method,discount,showDiscount,cash,card,customerPhone,notes]);

 const preset=catalog?.presets.find(p=>p.id===presetId);
 const carChoices=[{name:"سيارة صغيرة",icon:"🚗"},{name:"سيارة كبيرة",icon:"🚙"},{name:"شاحنة",icon:"🚚"}] as const;
 const otherCarTypes=Array.from(new Set((catalog?.presets||[]).map(p=>p.car_type)))
  .filter(name=>!carChoices.some(c=>c.name===name));
 const filteredPresets=(catalog?.presets||[]).filter(p=>p.car_type===carType);
 const serviceSuggestions=Array.from(new Set((catalog?.presets||[]).map(p=>p.service_type)));
 function chooseCarType(name:string){
  setCarType(name);setPresetId("");setManualMode(false);setShowMoreServices(false);
  setManualPrice("");setManualService("");setPriceReason("");setSelectedAddons([]);
 }
 const manualServiceAllowed=manager||catalog?.manualServiceEnabled!==false;
 const useException=manualMode;
 const totalAddons=useMemo(()=>(catalog?.addons||[])
  .filter(a=>selectedAddons.includes(a.id)).reduce((v,a)=>v+Number(a.price),0),
 [catalog,selectedAddons]);
 const manualExtras=0;
 const discountNumber=Number(discount)||0;
 const basePrice=manualMode?Number(manualPrice||0):Number(preset?.amount||0);
 const price=rounded(basePrice+totalAddons+manualExtras-discountNumber);
 useEffect(()=>{
  if(!preset&&!manualMode)return;
  if(!draftReady)return;
  if(skipRestoredPayment.current){skipRestoredPayment.current=false;return;}
  if(method==="cash"){setCash(String(price));setCard("0");}
  else if(method==="card"){setCash("0");setCard(String(price));}
  else{
   const half=rounded(price/2);
   setCash(String(half));setCard(String(rounded(price-half)));
  }
 },[price,method,presetId,draftReady]);

 const paymentMismatch=method==="mixed"&&(!Number.isFinite(Number(cash))||!Number.isFinite(Number(card))||Number(cash)<0||Number(card)<0||rounded(Number(cash)+Number(card))!==price);
 async function submit(e:React.FormEvent){
  e.preventDefault();setError("");setStatus("");
  if(!catalog||!draftReady||busy||savingNow.current||(!preset&&!manualMode))return;
  if(manualMode&&!manualServiceAllowed){setError("السعر الاستثنائي معطل في الإعدادات");return;}
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
  const basis={
   presetId,addons:[...selectedAddons],cash:c,card:d,discount:discountValue,
   notes,customerPhone:phone,whatsappConsent:!!phone,
   ...(useException?{oneTime:{enabled:true as const,carType:carType||preset?.car_type||"",
    service:manualMode?manualService.trim():preset?.service_type||"",
    price:rounded(basePrice),addons:[],reason:priceReason.trim()}}:{})
  };
  const id=crypto.randomUUID(); // Each car always receives its own immutable idempotency key.
  const payload:WorkerSubmission=directPending.current??{...basis,mutationId:id,recordedAt:new Date().toISOString()};
  savingNow.current=true;setBusy(true);
  try{
   // Prefer an encrypted write-ahead queue. Online-only direct submission is
   // available if Safari/IndexedDB fails, but NEVER when offline or queue-full.
   // All retries reuse the same idempotency key, including uncertain responses.
   try{
    await queueWorkerRecord(outboxKey,payload);
    directPending.current=null;
   }catch(storageError){
    const detail=storageError instanceof Error?storageError.message:"";
    if(!navigator.onLine||/queue limit reached|duplicate queued/i.test(detail))throw storageError;
    directPending.current=payload;
    const headers:Record<string,string>={"content-type":"application/json"};
    if(manager){
     const {data:{session}}=await supabase.auth.getSession();
     if(!session)throw Error("جلسة المدير غير متاحة. لم يثبت حفظ السيارة.");
     headers.authorization="Bearer "+session.access_token;
    }
    const response=await fetch("/api/worker-links/record",{
     method:"POST",headers,credentials:"same-origin",cache:"no-store",
     body:JSON.stringify({...payload,...(manager?{}:{token})})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
     // 4xx (except rate-limit) is a definitive rejection; a 5xx/429
     // keeps the pending UUID so the next attempt cannot duplicate a car.
     if(response.status<500&&response.status!==429)directPending.current=null;
     throw Error(response.status>=500||response.status===429
      ?"لم يتأكد تسجيل السيارة. أعد المحاولة من نفس الصفحة دون تحديثها كي تستخدم نفس رقم العملية."
      :result.error||"السيرفر رفض تسجيل السيارة");
    }
    if(result.ok!==true||!result.id)
     throw Error("لم يتأكد استلام التسجيل؛ أعد المحاولة من نفس الصفحة.");
    directPending.current=null;
    await deleteWorkerDraft(outboxKey).catch(()=>{});
    setNotes("");setSelectedAddons([]);setDiscount("0");setShowDiscount(false);
    setManualMode(false);setPriceReason("");setCarType("");setPresetId("");
    setManualService("");setManualPrice("");setCustomerPhone("");
    setStatus("تم تسجيل السيارة بنجاح.");
    setSummaryVersion(v=>v+1);
    window.dispatchEvent(new Event("carwash:data-changed"));
    window.scrollTo({top:0,behavior:"smooth"});
    return;
   }
   setQueued((await listWorkerRecords(outboxKey)).length);
   await deleteWorkerDraft(outboxKey).catch(()=>{});
   setStatus("العملية محفوظة على هذا الجهاز؛ ستُرسل عند توفر الإنترنت.");
   setNotes("");setSelectedAddons([]);setDiscount("0");setShowDiscount(false);
   setManualMode(false);setPriceReason("");setCarType("");setPresetId("");
   setManualService("");setManualPrice("");setCustomerPhone("");
   if(navigator.onLine)void replay();
   window.scrollTo({top:0,behavior:"smooth"});
  }catch(e){
   setError(e instanceof Error?e.message:"تعذر الحفظ الآمن؛ لم تُسجل السيارة.");
  }finally{savingNow.current=false;setBusy(false);}
 }
 return <main className="worker-screen min-h-screen px-3 sm:px-4 py-6 max-w-3xl mx-auto space-y-4"
  dir={workerDirection(locale)} lang={locale}>
  <header className="card flex flex-wrap items-center justify-between gap-3">
   <h1 className="section-title mb-0">{tt("reg.title")}</h1>
   {!manager&&<div className="flex gap-1 rounded-xl border p-1 text-xs" dir="ltr"
    role="group" aria-label="Language">
    {(["ha-NG","en","ar"] as const).map(choice=><button key={choice} type="button"
     className={locale===choice?"btn-primary px-2 py-2":"btn-secondary px-2 py-2"}
     aria-pressed={locale===choice} onClick={()=>selectLanguage(choice)}>
     {choice==="ha-NG"?"Hausa":choice==="en"?"English":"العربية"}
    </button>)}
   </div>}
  </header>
  {queued>0&&<section className="card space-y-2" role="status">
    <p className="font-bold">{tt("reg.pending",{n:queued})}</p>

    <button type="button" className="btn-secondary w-full" disabled={syncing||!navigator.onLine} onClick={()=>void replay()}>{syncing?tt("reg.syncing"):tt("reg.retry")}</button>
   </section>}
  {loading?<section className="card text-center">{tt("reg.loading")}</section>:
   invalid?<section className="card"><p className="txt-danger">{workerMessage(locale,invalid,"error.invalidLink")}</p>
    <p className="txt-muted text-sm mt-2">{tt("reg.invalid")}</p></section>:
  <form onSubmit={submit} className="card space-y-4">
   {!draftReady&&<p role="status">{tt("reg.draft")}</p>}
   {status&&<p className="rounded-lg p-3 text-sm" style={{background:"var(--tone-green-bg)",color:"var(--tone-green-fg)"} } role="status">{workerMessage(locale,status,"reg.success")}</p>}
   {error&&<p className="txt-danger text-sm" role="alert">{workerMessage(locale,error)}</p>}
   <div className="space-y-3">
    <h2 className="form-label">{tt("reg.vehicle")}</h2>
    <div className="grid grid-cols-3 gap-2" data-testid="car-type-choices">
     {carChoices.map(choice=><button type="button" key={choice.name}
      aria-pressed={carType===choice.name}
      className={carType===choice.name?"btn-primary p-3":"btn-secondary p-3"}
      onClick={()=>chooseCarType(choice.name)}>
      <span className="block text-2xl" aria-hidden="true">{choice.icon}</span>
      <span className="block text-sm font-bold">{workerCarName(locale,choice.name)}</span>
     </button>)}
    </div>
    {otherCarTypes.length>0&&<details className="rounded-lg border p-2" style={{borderColor:"var(--border)"}}>
     <summary className="cursor-pointer text-sm">{tt("reg.other")}</summary>
     <div className="carwash-quick-choices mt-2">
      {otherCarTypes.map(name=><button type="button" key={name}
       className={carType===name?"active":""} onClick={()=>chooseCarType(name)}>{workerCarName(locale,name)}</button>)}
     </div>
    </details>}
   </div>
   {carType&&<div className="space-y-3" data-testid="service-choices">
    <h2 className="form-label">{tt("reg.wash")}</h2>
    {filteredPresets.length>0?<div className="grid grid-cols-2 gap-2">
     {filteredPresets.slice(0,showMoreServices?100:6).map(p=><button type="button" key={p.id}
      className={!manualMode&&presetId===p.id?"btn-primary p-3 text-start":"btn-secondary p-3 text-start"}
      aria-pressed={!manualMode&&presetId===p.id}
      onClick={()=>{setPresetId(p.id);setManualMode(false);setManualService("");setManualPrice("");
       try{localStorage.setItem("carwash_last_preset_v1",p.id);}catch{}}}>
      <span className="block font-bold">{workerServiceName(locale,p.service_type)}</span>
      <strong className="block text-lg" dir="ltr">{money(Number(p.amount))}</strong>
     </button>)}
    </div>:<div className="grid grid-cols-2 gap-2">
     {serviceSuggestions.map(service=><button key={service} type="button"
      className={manualMode&&manualService===service?"btn-primary p-3":"btn-secondary p-3"}
      onClick={()=>{setPresetId("");setManualService(service);setManualPrice("");
       setPriceReason("تسعير يدوي للخدمة");setManualMode(true);}}>
      {workerServiceName(locale,service)}
     </button>)}
    </div>}
    {filteredPresets.length>6&&<button type="button" className="btn-secondary w-full"
     onClick={()=>setShowMoreServices(v=>!v)}>{showMoreServices?tt("reg.less"):tt("reg.more")}</button>}
    {manualServiceAllowed&&preset&&<button type="button" className="btn-secondary w-full"
     aria-expanded={manualMode} onClick={()=>{
      if(manualMode){setManualMode(false);setManualService("");setManualPrice("");}
      else{setManualMode(true);setManualService(preset?.service_type||"");
       setManualPrice(String(preset?.amount||""));setPriceReason("تعديل السعر يدويًا");}
     }}>{manualMode&&preset?tt("reg.official"):tt("reg.manual")}</button>}
    {manualMode&&<div className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--border)"}}>
     <label className="form-label">{tt("reg.service")}
      <input maxLength={80}
       value={!manager&&preset?.service_type===manualService
        ?workerServiceName(locale,manualService):manualService}
       onChange={e=>setManualService(e.target.value)}/>
     </label>
     <label className="form-label">{manager?"السعر لهذه السيارة (ر.س)":tt("reg.manualPrice")}
      <input type="number" inputMode="decimal" min=".01" max="5000" step=".01"
       value={manualPrice} onChange={e=>setManualPrice(e.target.value)}/>
     </label>
    </div>}
   </div>}
   {(catalog?.addons.length||0)>0&&<div className="space-y-2">
    <p className="form-label">{tt("reg.addons")}</p>
    {catalog?.addons.map(a=><label key={a.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
     <span><input type="checkbox" checked={selectedAddons.includes(a.id)}
      onChange={e=>setSelectedAddons(v=>e.target.checked?[...v,a.id]:v.filter(z=>z!==a.id))}/> {workerAddonName(locale,a.name)}</span>
     <span>{money(Number(a.price))}</span>
    </label>)}
   </div>}

   {useException&&<details className="border rounded-lg p-3">
    <summary className="cursor-pointer text-sm">{tt("reg.reason")}</summary>
    <input type="text" className="w-full mt-2" maxLength={300} required value={!manager&&["تعديل السعر يدويًا","تسعير يدوي للخدمة"].includes(priceReason)?tt("reg.manual"):priceReason}
     onChange={e=>setPriceReason(e.target.value)} placeholder={tt("reg.reasonHint")}/>
   </details>}
   <div className="space-y-2">
    <button type="button" className="btn-secondary w-full" onClick={()=>{setShowDiscount(v=>!v);setDiscount("0");}}>{showDiscount?tt("reg.discountCancel"):tt("reg.discountAdd")}</button>
    {showDiscount&&<label className="form-label">{tt("reg.discountMax",{max:money(Number(catalog?.discountLimit??10))})}
     <input type="number" inputMode="decimal" min="0" max={Number(catalog?.discountLimit??10)} step=".01"
      value={discount} onChange={e=>setDiscount(e.target.value)} required/>
    </label>}
   </div>
   <div className="space-y-2">
    <p className="form-label">{tt("reg.payment")}</p>
    <div className="grid grid-cols-3 gap-2">
     {(["cash","card","mixed"] as const).map(x=>
      <button type="button" key={x} className={method===x?"btn-primary":"btn-secondary"}
       onClick={()=>{
        setMethod(x);
        try{localStorage.setItem("carwash_last_payment_v1",x);}catch{}
       }}>{x==="cash"?tt("reg.cash"):x==="card"?tt("reg.pos"):tt("reg.mixed")}</button>)}
    </div>
   </div>
   {method==="mixed"&&<div className="grid grid-cols-2 gap-3">
    <label className="form-label">{tt("reg.cashAmount")}
     <input aria-invalid={paymentMismatch} aria-describedby={paymentMismatch?"payment-error":undefined} style={paymentMismatch?{borderColor:"#d92d20",borderWidth:2}:undefined} type="number" inputMode="decimal" min="0" step=".01" value={cash}
      onChange={e=>setCash(e.target.value)}/>
    </label>
    <label className="form-label">{tt("reg.posAmount")}
     <input aria-invalid={paymentMismatch} aria-describedby={paymentMismatch?"payment-error":undefined} style={paymentMismatch?{borderColor:"#d92d20",borderWidth:2}:undefined} type="number" inputMode="decimal" min="0" step=".01" value={card}
      onChange={e=>setCard(e.target.value)}/>
    </label>
   </div>}
   {paymentMismatch&&<p id="payment-error" className="txt-danger text-sm" role="alert">{tt("reg.mismatch",{amount:money(price)})}</p>}
   <div className="rounded-xl p-3 space-y-1" style={{background:"var(--surface-3)",color:"var(--text)"}}>
    <div className="flex justify-between gap-2 text-sm"><span>{tt("reg.base")}</span><strong>{money(basePrice)}</strong></div>
    {(totalAddons+manualExtras)>0&&<div className="flex justify-between gap-2 text-sm"><span>{tt("reg.extras")}</span><strong>{money(totalAddons+manualExtras)}</strong></div>}
    {discountNumber>0&&<div className="flex justify-between gap-2 text-sm"><span>{tt("reg.discount")}</span><strong>−{money(discountNumber)}</strong></div>}
    <div className="flex justify-between gap-2 border-t pt-2 mt-2"><span className="font-bold">{tt("reg.total")}</span><strong className="text-xl">{money(Math.max(0,price))}</strong></div>
   </div>
   <details className="border rounded-lg p-3">
    <summary className="cursor-pointer font-semibold">{tt("reg.info")}</summary>
    <div className="space-y-3 pt-3">
     <label className="form-label">{tt("reg.notes")}
      <input type="text" maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}
       placeholder={tt("reg.notesHint")}/>
     </label>
     <label className="form-label">{tt("reg.phone")}
      <input type="tel" inputMode="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}
       placeholder="05XXXXXXXX"/>
     </label>

    </div>
   </details>
   <button className="btn-primary w-full py-4 text-lg" type="submit" disabled={!draftReady||busy||(!preset&&!manualMode)||price<=0}>
    {busy?tt("reg.saving"):tt("reg.save")}
   </button>

  </form>}
  {safeToken&&!invalid&&<WorkerDailySummary token={manager?undefined:token}
   manager={manager} locale={locale} refreshKey={summaryVersion} queued={queued}/>}
  {safeToken&&!invalid&&<ReadyCarsPanel token={manager?undefined:token} manager={manager} locale={locale} refreshKey={summaryVersion}/>}
 </main>;
}
