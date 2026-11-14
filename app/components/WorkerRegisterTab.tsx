"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {fetchAllRows} from "@/lib/fetchAll";
import {formatCurrency} from "@/lib/business";
import {riyadhDayKey,dayIsFinished,calendarDayTotals} from "@/lib/carwashCalendarDay";
import {isNetworkError} from "@/lib/offlineSync";
import {enqueue,getQueueByTable,queueLength} from "@/lib/offlineQueue";
import {normalizeSaudiMobile} from "@/lib/phone";
import {isApprovedStaffPrice,selectedAddonsTotal,type CatalogAddon} from "@/lib/priceGovernance";
import {showToast} from "@/lib/toast";
import {Modal} from "./Modal";
import {InstallAppButton} from "./InstallAppButton";
import {dispatchCarwashWhatsAppNotices} from "@/lib/whatsappDispatchClient";
import type {Entry,EntryPreset} from "@/lib/types";

type Day={business_date:string;status:"open"|"awaiting_owner"|"approved"};
type StaffEntry=Entry & {business_date?:string|null;device_id?:string|null};
function queued():StaffEntry[]{
 return getQueueByTable("entries").map(item=>{
  const p=item.payload;
  const cash=Number(p.cash_paid)||0,card=Number(p.card_paid)||0;
  return {
   id:"pending-"+item.id,car_type:String(p.car_type||""),service_type:String(p.service_type||""),
   occurred_at:String(p.occurred_at||item.createdAt),
   business_date:riyadhDayKey(String(p.occurred_at||item.createdAt)),
   cash_paid:cash,card_paid:card,gross:cash+card,
   discount_amount:Number(p.discount_amount)||0,
   payment_method:cash&&card?"مختلط":cash?"كاش":"بطاقة",
   pending:true,ready_at:null,notes:String(p.notes||""),
   customer_phone:p.customer_phone?String(p.customer_phone):null,
   worker_name:null,
  };
 });
}
function getDeviceId(){
 let value=localStorage.getItem("carwash_device_id_v2");
 if(!value||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)){
  value=crypto.randomUUID();localStorage.setItem("carwash_device_id_v2",value);
 }
 return value;
}
export function WorkerRegisterTab(){
 const [now,setNow]=useState(new Date());
 const [device,setDevice]=useState<string|null>(null);
 const [enrolled,setEnrolled]=useState(false);
 const [days,setDays]=useState<Day[]>([]);
 const [rows,setRows]=useState<StaffEntry[]>([]);
 const [pending,setPending]=useState<StaffEntry[]>([]);
 const [presets,setPresets]=useState<EntryPreset[]>([]);
 const [addons,setAddons]=useState<CatalogAddon[]>([]);
 const [presetId,setPresetId]=useState("");
 const [method,setMethod]=useState<"cash"|"card"|"mixed">("cash");
 const [cash,setCash]=useState("");
 const [card,setCard]=useState("");
 const discount="0";
 const [chosenAddons,setChosenAddons]=useState<string[]>([]);
 const [phone,setPhone]=useState("");
 
 const [notes,setNotes]=useState("");
 const [saving,setSaving]=useState(false);
 const [syncError,setSyncError]=useState("");
 const [details,setDetails]=useState<StaffEntry|null>(null);
 const [folded,setFolded]=useState<string[]>([]);
 const [sealBusy,setSealBusy]=useState<string|null>(null);
 const today=riyadhDayKey(now);
 const selected=presets.find(p=>p.id===presetId);
 const extras=useMemo(()=>selectedAddonsTotal(addons,chosenAddons),[addons,chosenAddons]);
 const price=Number(selected?.amount||0)+extras;
 const actualPaid=Math.max(0,Math.round((price-(Number(discount)||0))*100)/100);

 const reload=useCallback(async()=>{
  if(!navigator.onLine)return;
  try{
   const [dayResult,entriesResult]=await Promise.all([
    supabase.from("carwash_days").select("business_date,status")
     .in("status",["open","awaiting_owner"]).order("business_date",{ascending:false}),
    fetchAllRows<StaffEntry>((from,to)=>supabase.from("entries").select("*")
      .is("deleted_at",null).not("business_date","is",null)
      .order("occurred_at",{ascending:false}).range(from,to)),
   ]);
   if(dayResult.error)throw dayResult.error;
   setDays((dayResult.data||[]) as Day[]);
   setRows(entriesResult);
   setSyncError("");
  }catch(e){setSyncError("تعذّر تحديث تسجيلات العمال: "+(e instanceof Error?e.message:"خطأ اتصال"));}
 },[]);

 useEffect(()=>{
  const id=getDeviceId();setDevice(id);
  const update=()=>setPending(queued());
  update();
  const enroll=async()=>{
   if(!navigator.onLine)return;
   const {error}=await supabase.rpc("enroll_carwash_worker_device",{p_device_id:id});
   if(error){setSyncError("تعذر اعتماد الجهاز: "+error.message);return;}
   setEnrolled(true);
  };
  void enroll();
  const online=()=>{void enroll();void reload();};
  window.addEventListener("online",online);
  window.addEventListener("offline-queue-changed",update);
  const tick=setInterval(()=>{setNow(new Date());if(navigator.onLine)void reload();},12000);
  return()=>{window.removeEventListener("online",online);
   window.removeEventListener("offline-queue-changed",update);clearInterval(tick);};
 },[reload]);

 useEffect(()=>{
  if(!navigator.onLine)return;
  let cancelled=false;
  async function load(){
   const [p,a]=await Promise.all([
    supabase.from("entry_presets").select("*").eq("active",true).order("sort_order"),
    supabase.from("carwash_addons").select("id,name,price,active").eq("active",true).order("name")
   ]);
   if(cancelled)return;
   if(p.error||a.error){setSyncError("تعذر تحميل الأسعار المعتمدة.");return;}
   setPresets((p.data||[]) as EntryPreset[]);
   setAddons((a.data||[]) as CatalogAddon[]);
   if(!presetId&&p.data?.length)setPresetId(p.data[0].id);
   localStorage.setItem("carwash_worker_tariff_cache",JSON.stringify({presets:p.data||[],addons:a.data||[]}));
  }
  const raw=localStorage.getItem("carwash_worker_tariff_cache");
  if(raw)try{
   const parsed=JSON.parse(raw);setPresets(parsed.presets||[]);setAddons(parsed.addons||[]);
   if(parsed.presets?.length)setPresetId(v=>v||parsed.presets[0].id);
  }catch{}
  void load();
  return()=>{cancelled=true;};
 // Price catalog cache is read-only offline; server rechecks every price.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 useEffect(()=>{
  if(!selected)return;
  const net=Math.max(0,Math.round((price-(Number(discount)||0))*100)/100);
  if(method==="cash"){setCash(String(net));setCard("0");}
  else if(method==="card"){setCash("0");setCard(String(net));}
  else {const half=Math.round(net*50)/100;setCash(String(half));setCard(String(Math.round((net-half)*100)/100));}
 },[selected,method,price,discount]);

 const visible=useMemo(()=>{
  const open=new Set(days.filter(d=>d.status!=="approved").map(d=>d.business_date));
  open.add(today); // today is virtual before first entry
  return [...rows,...pending].filter(e=>open.has(e.business_date||riyadhDayKey(e.occurred_at)));
 },[days,rows,pending,today]);
 const dateKeys=useMemo(()=>Array.from(new Set([...visible.map(e=>e.business_date||riyadhDayKey(e.occurred_at)),today]))
  .sort((a,b)=>b.localeCompare(a)),[visible,today]);
 const groups=useMemo(()=>dateKeys.map(day=>({
  day,entries:visible.filter(e=>(e.business_date||riyadhDayKey(e.occurred_at))===day)
 })),[dateKeys,visible]);
 const total=calendarDayTotals(visible);

 async function add(){
  if(!selected){showToast("اختر الخدمة أولًا.","warning");return;}
  if(!device){showToast("تعذّر التعرف على هذا الجهاز.","warning");return;}
  if(navigator.onLine&&!enrolled){showToast("يجب اعتماد الجهاز مرة واحدة قبل التسجيل.","warning");return;}
  const discountNumber=Number(discount),cashNumber=Number(cash),cardNumber=Number(card);
  if(!isApprovedStaffPrice({
   carType:selected.car_type,serviceType:selected.service_type,cash:cashNumber,card:cardNumber,
   discount:discountNumber,presets,addons,selectedAddons:chosenAddons
  })){showToast("السعر يجب أن يطابق الغسيل والإضافات المعتمدة، بدون خصم.","warning");return;}
  const customerPhone=phone.trim()?normalizeSaudiMobile(phone):null;
  if(phone.trim()&&!customerPhone){showToast("رقم الجوال غير صحيح.","warning");return;}
  const payload={
   car_type:selected.car_type,service_type:selected.service_type,
   cash_paid:cashNumber,card_paid:cardNumber,discount_amount:discountNumber,
   addon_ids:chosenAddons,customer_phone:customerPhone,sms_consent:false,whatsapp_consent:!!customerPhone,
   notes:notes||null,occurred_at:new Date().toISOString(),device_id:device,
   client_mutation_id:crypto.randomUUID()
  };
  setSaving(true);
  const locally=()=>{enqueue("entries",payload);setPending(queued());showToast("حُفظت السيارة على الجهاز لحين رجوع الإنترنت.","warning");};
  if(!navigator.onLine){locally();setSaving(false);}
  else {
   const {error}=await supabase.from("entries").insert(payload);
   setSaving(false);
   if(error){if(isNetworkError(error))locally();else{showToast("تعذر التسجيل: "+error.message,"error");return;}}
   else {showToast("سُجلت السيارة في يوم الرياض الحالي.");await reload();}
  }
  setPhone("");setNotes("");setChosenAddons([]);
 }

 async function ready(entry:StaffEntry){
  if(!confirm("تأكيد انتهاء غسيل السيارة وإعداد إشعار جاهزية العميل؟"))return;
  const payload=entry.pending
   ?{p_client_mutation_id:entry.id.slice("pending-".length)}
   :{p_entry_id:entry.id};
  if(!navigator.onLine){enqueue("ready_notice",payload);showToast("الجاهزية محفوظة حتى المزامنة.","warning");return;}
  const {error}=await supabase.rpc("request_ready_notice",payload);
  if(error){if(isNetworkError(error))enqueue("ready_notice",payload);
   else showToast(error.message,"error");return;}
  const result=await dispatchCarwashWhatsAppNotices();
  showToast(result.accepted>0?"تم قبول إشعار واتساب لدى مزود الخدمة.":"تم تسجيل الجاهزية؛ يبقى إشعار واتساب معلّقًا حتى تفعيل المزود وربطه.",
   result.accepted>0?"success":"warning");
  void reload();
 }

 async function seal(day:string){
  if(!device||!dayIsFinished(day,now)){showToast("لا يمكن إقفال يوم الرياض الحالي.","warning");return;}
  if(!navigator.onLine||queueLength()!==0){showToast("زامن كل العمليات المعلقة قبل تأكيد اكتمال الجهاز.","warning");return;}
  setSealBusy(day);
  const {error}=await supabase.rpc("seal_carwash_business_day",{p_date:day,p_device_id:device});
  setSealBusy(null);
  if(error)showToast("تعذر تأكيد اليوم: "+error.message,"error");
  else showToast("تم تأكيد مزامنة هذا الجهاز لليوم؛ يستطيع المدير استكمال موازنته.");
 }

 return <div className="space-y-4" dir="rtl">
  <div className="card">
   <h2 className="section-title">تسجيل السيارات — حساب العمال المشترك</h2>
   <p className="txt-muted text-sm">اليوم المحاسبي من 12 صباحًا إلى 12 صباحًا بتوقيت الرياض. الأيام السابقة تظهر إلى أن يعتمد المدير موازنة كل يوم.</p>
   <div className="mt-3 flex flex-wrap gap-2 items-center">
    <InstallAppButton />
    <span className="text-xs txt-muted">{enrolled?"الجهاز معتمد":"تحقق من تسجيل الجهاز"} · {queueLength()} عملية غير متزامنة</span>
   </div>
   {syncError&&<p role="alert" className="txt-warning text-sm mt-2">{syncError}</p>}
  </div>
  <div className="grid grid-cols-2 gap-3">
   <button className="metric-card tone-blue" type="button" onClick={()=>setFolded([])}>
    <span className="metric-label">السيارات غير المعتمدة</span><strong className="metric-value">{total.cars}</strong>
   </button>
   <button className="metric-card tone-emerald" type="button" onClick={()=>setFolded([])}>
    <span className="metric-label">مجموع عشرات فريق العمال</span><strong className="metric-value">{formatCurrency(total.collectiveTens)}</strong>
   </button>
  </div>
  <section className="card space-y-3">
   <h3 className="section-title">سيارة جديدة — {today}</h3>
   {presets.length===0?<p className="txt-warning">يجب تحميل قائمة أسعار الغسيل مرة واحدة على الأقل أثناء اتصال الجهاز بالإنترنت.</p>:<>
    <label className="form-label">نوع السيارة والخدمة
     <select value={presetId} onChange={e=>setPresetId(e.target.value)}>
      {presets.map(p=><option key={p.id} value={p.id}>{p.car_type} · {p.service_type} · {formatCurrency(p.amount)}</option>)}
     </select>
    </label>
    {addons.length>0&&<div><p className="form-label">خدمات إضافية (اختيارية)</p>
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {addons.map(a=><label key={a.id} className="border rounded-xl p-3 flex justify-between gap-3">
       <span><input type="checkbox" checked={chosenAddons.includes(a.id)} onChange={e=>setChosenAddons(v=>e.target.checked?[...v,a.id]:v.filter(x=>x!==a.id))} /> {a.name}</span>
       <strong>{formatCurrency(a.price)}</strong>
      </label>)}
     </div>
    </div>}
    <div className="flex flex-wrap gap-2">{(["cash","card","mixed"] as const).map(x=>
     <button type="button" key={x} className={method===x?"btn-primary":"btn-secondary"} onClick={()=>setMethod(x)}>
      {x==="cash"?"كاش":x==="card"?"شبكة":"مختلط"}</button>)}
    </div>
    <div className="grid grid-cols-2 gap-3">
     <label className="form-label">كاش<input inputMode="decimal" type="number" min="0" step=".01" value={cash} onChange={e=>setCash(e.target.value)} /></label>
     <label className="form-label">شبكة<input inputMode="decimal" type="number" min="0" step=".01" value={card} onChange={e=>setCard(e.target.value)} /></label>
    </div>
    <p className="font-bold">السعر بعد الإضافات: {formatCurrency(actualPaid)}</p>
    <label className="form-label">جوال العميل — اختياري<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="05XXXXXXXX" /></label>
    <label className="form-label">ملاحظات (اختياري)
     <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} />
    </label>
    <button type="button" className="btn-add-car w-full" disabled={saving||!device||(!enrolled&&typeof navigator!=="undefined"&&navigator.onLine)}
      onClick={()=>void add()}>{saving?"جارٍ الحفظ":"تسجيل السيارة الآن"}</button>
   </>}
  </section>
  {groups.map(({day,entries})=>{
   const t=calendarDayTotals(entries);
   const status=days.find(d=>d.business_date===day)?.status||"open";
   return <section className="card" key={day}>
    <button type="button" className="w-full text-start section-title" onClick={()=>setFolded(v=>v.includes(day)?v.filter(x=>x!==day):[...v,day])}>
     {day===today?"اليوم":"يوم غير معتمد"} · {day} · {t.cars} سيارة
    </button>
    <div className="grid grid-cols-2 gap-3 mb-3">
     <div className="rounded-lg p-3 tone-blue">عدد السيارات <strong className="block text-xl">{t.cars}</strong></div>
     <div className="rounded-lg p-3 tone-emerald">مجموع العشرات <strong className="block text-xl">{formatCurrency(t.collectiveTens)}</strong></div>
    </div>
    <p className="txt-muted text-sm">{status==="awaiting_owner"?"بانتظار موافقة المالك على الفرق":"بانتظار اعتماد المدير"}{t.pending>0?` · ${t.pending} غير متزامنة`:""}</p>
    {!folded.includes(day)&&entries.map(e=>
     <div key={e.id} className="border-b py-3 flex flex-wrap justify-between items-center gap-3">
      <button type="button" className="link-inline text-start" onClick={()=>setDetails(e)}>
       {e.car_type} · {e.service_type} · {formatCurrency(e.cash_paid+e.card_paid)}
       {e.pending?" ⏳":""}
      </button>
      {e.customer_phone&&
       <button type="button" disabled={!!e.ready_at} className="btn-secondary" onClick={()=>void ready(e)}>
        {e.ready_at?"✓ جاهزة":"السيارة جاهزة"}</button>}
     </div>)}
    {dayIsFinished(day,now)&&status==="open"&&entries.length>0&&
     <button type="button" className="btn-secondary w-full mt-3"
      disabled={sealBusy===day||queueLength()>0} onClick={()=>void seal(day)}>
      {sealBusy===day?"جاري التأكيد":"تأكيد مزامنة الجهاز لهذا اليوم"}
     </button>}
   </section>;
  })}
  {details&&<Modal title="تفاصيل السيارة" onClose={()=>setDetails(null)}>
   <p className="font-semibold">{details.car_type} · {details.service_type}</p>
   <p>التاريخ: {new Date(details.occurred_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})}</p>
   <p>كاش: {formatCurrency(details.cash_paid)} · شبكة: {formatCurrency(details.card_paid)}</p>
   <p>الخصم: {formatCurrency(details.discount_amount||0)} · مخصص العمال الجماعي: 10 ر.س</p>
   <p className="txt-muted">{details.pending?"بانتظار رفع السجل":"السجل محفوظ على السيرفر"}</p>
  </Modal>}
 </div>;
}
