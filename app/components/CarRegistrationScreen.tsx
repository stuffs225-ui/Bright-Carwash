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

export function CarRegistrationScreen({token="",manager=false,managerUserId=""}:{token?:string;manager?:boolean;managerUserId?:string}){
 // Stable per-manager namespace, not an authorization credential.
 // Outbox records are encrypted using a random non-extractable device key.
 const outboxKey=manager
  ? (/^[0-9a-f-]{36}$/i.test(managerUserId)?managerUserId.toLowerCase().replace(/-/g,"").padEnd(64,"0"):"")
  :token;
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
     if(outboxKey)void storeWorkerCatalog(outboxKey,info).catch(()=>setError("التخزين الآمن غير متاح على هذا الجهاز؛ يلزم الإنترنت عند التسجيل."));
    }
   }catch(e){
    const fallback=outboxKey?await loadWorkerCatalog(outboxKey).catch(()=>null):null;
    if(!cancelled){
     if(fallback){setCatalog(fallback);if(fallback.presets?.length){setPresetId(fallback.presets[0].id);setCarType(fallback.presets[0].car_type);}
      setStatus("أنت دون اتصال: الأسعار المحفوظة مؤقتة، وسيُراجعها السيرفر عند المزامنة.");}
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
   if(sent){setSummaryVersion(v=>v+1);if(remaining===0)setStatus("تمت مزامنة جميع السيارات المحفوظة بنجاح.");}
   return {sent,remaining,blocked};
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
  const payload:WorkerSubmission={...basis,mutationId:id,recordedAt:new Date().toISOString()};
  setBusy(true);
  try{
   // Write ahead: every submission is an immutable encrypted outbox item BEFORE network IO.
   // Retrying after an uncertain response reuses the same UUID and cannot double-book.
   await queueWorkerRecord(outboxKey,payload);
   setQueued((await listWorkerRecords(outboxKey)).length);
   setStatus("العملية محفوظة مشفرة على هذا الجهاز؛ ستُرسل إلى السيرفر عند الاتصال.");
   setNotes("");setSelectedAddons([]);setDiscount("0");setShowDiscount(false);
   setManualMode(false);setManualAddons([]);setPriceReason("");
   setCustomerPhone("");setConsent(false);setMethod("cash");
   if(navigator.onLine){
    const result=await replay().catch((e:unknown)=>{
     setError(e instanceof Error?e.message:"تعذرت المزامنة؛ العملية محفوظة على الجهاز.");
     return {sent:0,remaining:1,blocked:0};
    });
    if(result.remaining===0&&result.blocked===0)setStatus("تم تسجيل السيارة بنجاح.");
    else setStatus("التسجيل محفوظ على الجهاز ولم يتأكد وصوله بعد. لا تحذفه.");
   }
   window.scrollTo({top:0,behavior:"smooth"});
  }catch(e){
   setError(e instanceof Error?e.message:"تعذر الحفظ الآمن؛ لم تُسجل السيارة.");
  }finally{setBusy(false);}
 }
 return <main className="min-h-screen px-3 sm:px-4 py-6 max-w-3xl mx-auto space-y-4" dir="rtl">
  <header className="card text-center space-y-2">
   <h1 className="section-title">🚗 تسجيل السيارات {manager?"— الإدارة":""}</h1>
   <p className="txt-muted text-sm">مغسلة سيارتك اللامعة</p>
   {catalog&&<p className="text-sm font-bold">{catalog.label}</p>}
  </header>
  {safeToken&&!invalid&&<WorkerDailySummary token={manager?undefined:token} manager={manager} refreshKey={summaryVersion}/>}
  {queued>0&&<section className="card space-y-2" role="status">
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
   <div className="space-y-2">
    <p className="form-label">1. نوع السيارة</p>
    <div className="carwash-quick-choices">
     {allCarTypes.map(name=><button type="button" key={name}
       className={name===carType?"active":""}
       aria-pressed={name===carType} onClick={()=>{
        setCarType(name);setShowMoreServices(false);
        const first=catalog?.presets.find(p=>p.car_type===name);
        if(first)setPresetId(first.id);
        setManualMode(false);setManualAddons([]);
        try{localStorage.setItem("carwash_last_car_type_v1",name);}catch{}
       }}>{name}</button>)}
    </div>
   </div>
   <div className="space-y-2">
    <p className="form-label">2. الخدمة والسعر المعتمد</p>
    {filteredPresets.length===0?<p className="txt-muted text-sm">لا توجد خدمات مفعلة لهذا النوع. استخدم خدمة استثنائية إذا كانت الصلاحية متاحة.</p>:
     <div className="carwash-quick-choices">
      {filteredPresets.slice(0,showMoreServices?100:4).map(p=>
       <button type="button" key={p.id}
        className={!manualMode&&presetId===p.id?"active":""}
        aria-pressed={!manualMode&&presetId===p.id}
        onClick={()=>{setPresetId(p.id);setManualMode(false);setPriceReason("");}}>
        <span>{p.service_type}</span><strong>{sar(Number(p.amount))}</strong>
       </button>)}
     </div>}
    {filteredPresets.length>4&&<button type="button" className="btn-secondary w-full"
      onClick={()=>setShowMoreServices(v=>!v)}>
      {showMoreServices?"إخفاء الخيارات الأقل استخدامًا":"المزيد من الخدمات"}
    </button>}
    {manualServiceAllowed&&<button type="button" className={manualMode?"btn-primary w-full":"btn-secondary w-full"}
     aria-expanded={manualMode} onClick={()=>{
      setManualMode(v=>!v);
      setManualService(preset?.service_type||"");
      setManualPrice(String(Number(preset?.amount||0)));
     }}>خدمة أو سعر مختلف لهذه السيارة فقط</button>}
    {manualMode&&<div className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--border)"}}>
     <p className="txt-muted text-sm">لن يُضاف هذا السعر إلى القائمة الرسمية. يحفظ النظام المبلغ وسبب الاختلاف مع هذه السيارة فقط.</p>
     <label className="form-label">اسم الخدمة
      <input type="text" maxLength={80} value={manualService}
       onChange={e=>setManualService(e.target.value)} placeholder="مثل غسيل ماكينة"/>
     </label>
     <label className="form-label">السعر الأساسي لهذه السيارة (ر.س)
      <input type="number" inputMode="decimal" min=".01" max="5000" step=".01"
       value={manualPrice} onChange={e=>setManualPrice(e.target.value)}/>
     </label>
    </div>}
   </div>
   {(catalog?.addons.length||0)>0&&<div className="space-y-2">
    <p className="form-label">خدمات إضافية (اختياري)</p>
    {catalog?.addons.map(a=><label key={a.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
     <span><input type="checkbox" checked={selectedAddons.includes(a.id)}
      onChange={e=>setSelectedAddons(v=>e.target.checked?[...v,a.id]:v.filter(z=>z!==a.id))}/> {a.name}</span>
     <span>{sar(Number(a.price))}</span>
    </label>)}
   </div>}
   {manualAddonAllowed&&<details className="border rounded-xl p-3" style={{borderColor:"var(--border)"}}>
    <summary className="cursor-pointer font-bold">إضافة خاصة لمرة واحدة (اختياري)</summary>
    <div className="space-y-3 pt-3">
     {manualAddons.map((a,i)=><div key={i} className="flex justify-between items-center gap-2 border-b pb-2">
      <span>{a.name} — {sar(a.price)}</span>
      <button type="button" className="btn-secondary" onClick={()=>setManualAddons(items=>items.filter((_,j)=>i!==j))}>إزالة</button>
     </div>)}
     <label className="form-label">اسم الإضافة
      <input value={manualAddonName} maxLength={80}
       onChange={e=>setManualAddonName(e.target.value)} placeholder="مثل تنظيف داخلي خاص"/>
     </label>
     <label className="form-label">سعر الإضافة (ر.س)
      <input type="number" min=".01" max="5000" inputMode="decimal" step=".01"
       value={manualAddonPrice} onChange={e=>setManualAddonPrice(e.target.value)}/>
     </label>
     <button type="button" className="btn-secondary w-full" onClick={()=>{
      const v=Number(manualAddonPrice);
      if(manualAddonName.trim().length<2||!Number.isFinite(v)||v<=0||v>5000||
       Math.abs(rounded(v)-v)>0.000001||manualAddons.length>=8){
       setError("أدخل اسمًا وسعرًا صحيحًا للإضافة");return;
      }
      setManualAddons(all=>[...all,{name:manualAddonName.trim(),price:v}]);
      setManualAddonName("");setManualAddonPrice("");setError("");
     }}>إضافة لهذا التسجيل فقط</button>
    </div>
   </details>}
   {useException&&<label className="form-label">سبب السعر أو الخدمة الاستثنائية
    <input type="text" maxLength={300} required value={priceReason}
     onChange={e=>setPriceReason(e.target.value)}
     placeholder="مثل خدمة خاصة أو سعر استثنائي بطلب العميل"/>
   </label>}
   <div className="space-y-2">
    <button type="button" className="btn-secondary w-full" onClick={()=>{setShowDiscount(v=>!v);setDiscount("0");}}>{showDiscount?"إلغاء الخصم":"إضافة خصم (اختياري)"}</button>
    {showDiscount&&<label className="form-label">الخصم (حتى {sar(Number(catalog?.discountLimit??10))})
     <input type="number" inputMode="decimal" min="0" max={Number(catalog?.discountLimit??10)} step=".01"
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
   <div className="rounded-xl p-3 space-y-1" style={{background:"var(--surface-3)",color:"var(--text)"}}>
    <div className="flex justify-between gap-2 text-sm"><span>الخدمة الأساسية</span><strong>{sar(basePrice)}</strong></div>
    {(totalAddons+manualExtras)>0&&<div className="flex justify-between gap-2 text-sm"><span>الإضافات</span><strong>{sar(totalAddons+manualExtras)}</strong></div>}
    {discountNumber>0&&<div className="flex justify-between gap-2 text-sm"><span>الخصم</span><strong>−{sar(discountNumber)}</strong></div>}
    <div className="flex justify-between gap-2 border-t pt-2 mt-2"><span className="font-bold">المطلوب تحصيله</span><strong className="text-xl">{sar(Math.max(0,price))}</strong></div>
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
   <button className="btn-primary w-full py-4 text-lg" type="submit" disabled={busy||(!preset&&!manualMode)||price<=0}>
    {busy?"جارٍ الحفظ الآمن...":"تسجيل السيارة"}
   </button>
   <p className="txt-muted text-xs text-center">يمكن حفظ التسجيل مشفرًا على هذا الجهاز عند انقطاع الاتصال بعد فتح الصفحة أول مرة. لا يصبح التسجيل معتمدًا إلا بعد نجاح المزامنة، ولا يُرحّل تسجيل اليوم السابق تلقائيًا إلى يوم جديد.</p>
  </form>}
  {safeToken&&!invalid&&<ReadyCarsPanel token={manager?undefined:token} manager={manager} refreshKey={summaryVersion}/>}
 </main>;
}
