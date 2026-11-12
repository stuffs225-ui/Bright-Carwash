"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {fetchAllRows} from "@/lib/fetchAll";
import {formatCurrency} from "@/lib/business";
import {dayIsFinished,riyadhDayKey,calendarDayTotals} from "@/lib/carwashCalendarDay";
import {Modal} from "./Modal";
import {arabicDate} from "./ArabicDateField";
import {MetricCard} from "./MetricCard";
import type {Entry} from "@/lib/types";

type WorkerReport={business_date:string;actual_cash:number;actual_card:number;terminal_total:number;report_object_path:string;imageUrl:string;submitted_at:string};
type Day={business_date:string;status:"open"|"awaiting_owner"|"approved";approved_at:string|null;approved_by:string|null;reported?:boolean};
type Device={device_id:string;sealed_at:string|null;last_seen_at:string};
type Settlement={business_date:string;recorded_cash:number;recorded_card:number;
 actual_cash:number;terminal_card:number;cash_difference:number;card_difference:number;
 cars:number;collective_tens:number;report_object_path:string|null;difference_reason:string|null;
 expected_cash?:number|null;cash_expenses?:number|null;cash_worker_payments?:number|null;cash_movements_net?:number|null};
function toMoney(v:number){return Math.round(v*100)/100;}
function DifferenceCard({title,system,reported,systemLabel="النظام",reportedLabel="العامل"}:{
 title:string;system:number;reported:number;systemLabel?:string;reportedLabel?:string;
}){
 const difference=toMoney(reported-system);
 const mismatch=Math.abs(difference)>=0.01;
 return <div className="rounded-xl border-2 p-3 space-y-2"
  role={mismatch?"alert":undefined}
  style={{borderColor:mismatch?"#d92d20":"var(--border)",
   background:mismatch?"var(--tone-red-bg)":"var(--surface-2)"}}>
  <div className="flex justify-between items-center gap-2">
   <strong>{title}</strong><span className={mismatch?"txt-danger":"txt-cash"}>{mismatch?"⚠️ اختلاف":"✓ مطابق"}</span>
  </div>
  <div className="grid grid-cols-2 gap-2 text-sm">
   <p>{systemLabel}: <strong>{formatCurrency(system)}</strong></p>
   <p>{reportedLabel}: <strong>{formatCurrency(reported)}</strong></p>
  </div>
  {mismatch&&<p className="font-bold txt-danger">الفرق: {formatCurrency(difference)} ({difference>0?"زيادة":"نقص"})</p>}
 </div>;
}


export function DaySettlementTab({canApproveVariance}:{canApproveVariance:boolean}){
 const [now,setNow]=useState(new Date());
 const [days,setDays]=useState<Day[]>([]);
 const [selected,setSelected]=useState("");
 const initialDeepLinkHandled=useRef(false);
 const [rows,setRows]=useState<Entry[]>([]);
 const [cashExpenseRows,setCashExpenseRows]=useState<{id:string;amount:number;expense_type:string;notes:string|null}[]>([]);
 const [cashPayoutRows,setCashPayoutRows]=useState<{id:string;amount:number;notes:string|null}[]>([]);
 const [movements,setMovements]=useState<{id:string;amount:number;direction:string;reason:string}[]>([]);
 const [movementAmount,setMovementAmount]=useState("");
 const [movementDirection,setMovementDirection]=useState<"in"|"out">("out");
 const [movementReason,setMovementReason]=useState("");
 const [movementBusy,setMovementBusy]=useState(false);
 const [devices,setDevices]=useState<Device[]>([]);
 const [settlement,setSettlement]=useState<Settlement|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [detail,setDetail]=useState<Entry|null>(null);
 const [filter,setFilter]=useState<"all"|"cash"|"card"|"crew"|null>(null);
 const [cashActual,setCashActual]=useState("");
 const [posActual,setPosActual]=useState("");
 const [managerProof,setManagerProof]=useState<File|null>(null);
 const [workerReport,setWorkerReport]=useState<WorkerReport|null>(null);
 const reportForDay=workerReport?.business_date===selected?workerReport:null;
 const [reportCorrection,setReportCorrection]=useState(false);
 const [correctionsReady,setCorrectionsReady]=useState(false);
 const [corrections,setCorrections]=useState<Array<{id:string;version:number;reason:string;actual_cash:number;actual_card:number;terminal_total:number}>>([]);
 const [correctedCard,setCorrectedCard]=useState("");
 const [correctionReason,setCorrectionReason]=useState("");
 const correctionPending=useRef<Record<string,unknown>|null>(null);
 const [reason,setReason]=useState("");
 const [confirmedWorkerSync,setConfirmedWorkerSync]=useState(false);
 const [editing,setEditing]=useState<Entry|null>(null);
 const [editCash,setEditCash]=useState("");
 const [editCard,setEditCard]=useState("");
 const [editNotes,setEditNotes]=useState("");
 const current=days.find(d=>d.business_date===selected);
 const totals=useMemo(()=>calendarDayTotals(rows),[rows]);
 const cashExpenses=useMemo(()=>toMoney(cashExpenseRows.reduce((n,e)=>n+Number(e.amount),0)),[cashExpenseRows]);
 const cashWorkerPayouts=useMemo(()=>toMoney(cashPayoutRows.reduce((n,e)=>n+Number(e.amount),0)),[cashPayoutRows]);
 const movementNet=useMemo(()=>toMoney(movements.reduce((n,e)=>n+(e.direction==="in"?1:-1)*Number(e.amount),0)),[movements]);
 const expectedCash=toMoney(totals.cash-cashExpenses-cashWorkerPayouts+movementNet);
 const cashDiff=cashActual.trim()?toMoney(Number(cashActual)-expectedCash):null;
 const cardDiff=posActual.trim()?toMoney(Number(posActual)-totals.card):null;
 const workerCardDiff=reportForDay?toMoney(Number(reportForDay.actual_card)-totals.card):null;
 const terminalWorkerDiff=reportForDay?toMoney(Number(reportForDay.terminal_total)-Number(reportForDay.actual_card)):null;
 const networkMismatch=cardDiff!==null&&cardDiff!==0||
  workerCardDiff!==null&&workerCardDiff!==0||terminalWorkerDiff!==null&&terminalWorkerDiff!==0;
 const cashMismatch=cashDiff!==null&&cashDiff!==0;
 const hasVariance=cashDiff!==null&&cardDiff!==null&&(cashMismatch||networkMismatch);
 const filtered=rows.filter(e=>filter==="all"||filter==="crew"||
  (filter==="cash"&&Number(e.cash_paid)>0)||(filter==="card"&&Number(e.card_paid)>0));
 const incomplete=devices.filter(d=>!d.sealed_at);

 const reloadDays=useCallback(async()=>{
  if(!navigator.onLine)return;
  const {data,error}=await supabase.from("carwash_days")
   .select("business_date,status,approved_at,approved_by")
   .order("business_date",{ascending:false}).limit(90);
  if(error){setError("تعذر قراءة الأيام: "+error.message);return;}
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){setError("جلسة المدير غير متاحة");return;}
  const response=await fetch("/api/worker-links/day-report?list=1",{
   headers:{authorization:"Bearer "+session.access_token},cache:"no-store"
  });
  if(!response.ok){setError("تعذر قراءة حالات موازنة العمال");return;}
  const json=await response.json().catch(()=>({}));
  const reportDates=new Set<string>(Array.isArray(json.reportedDates)?json.reportedDates:[]);
  const list=((data||[]) as Day[]).map(day=>({...day,reported:reportDates.has(day.business_date)}));
  setDays(list);
  // Deep links select a day once; routine refreshes must not reopen a closed day.
  const requested=!initialDeepLinkHandled.current
   ?new URLSearchParams(window.location.search).get("day"):null;
  initialDeepLinkHandled.current=true;
  setSelected(old=>{
   if(requested&&list.some(d=>d.business_date===requested))return requested;
   if(old&&list.some(d=>d.business_date===old))return old;
   return "";
  });
 },[]);

 const reloadDay=useCallback(async()=>{
  if(reportCorrection)return;
  if(!selected||!navigator.onLine)return;
  try{
   const start=new Date(selected+"T00:00:00+03:00").toISOString();
   const end=new Date(new Date(selected+"T00:00:00+03:00").getTime()+86400000).toISOString();
   const [loaded,deviceList,proof,expenses,payouts,cashMoves]=await Promise.all([
    fetchAllRows<Entry>((from,to)=>supabase.from("entries").select("*")
     .eq("business_date",selected).is("deleted_at",null)
     .order("occurred_at",{ascending:false}).range(from,to)),
    supabase.from("carwash_day_devices").select("device_id,sealed_at,last_seen_at")
     .eq("business_date",selected),
    supabase.from("carwash_day_settlements").select("*")
     .eq("business_date",selected).maybeSingle(),
    supabase.from("expenses").select("id,expense_type,amount,notes")
     .is("deleted_at",null).eq("payment_source","cash")
     .gte("occurred_at",start).lt("occurred_at",end),
    supabase.from("worker_ledger").select("id,amount,notes")
     .is("deleted_at",null).eq("kind","payment").eq("payment_source","cash")
     .is("expense_id",null).gte("occurred_at",start).lt("occurred_at",end),
    supabase.from("carwash_cash_movements").select("id,amount,direction,reason")
     .is("deleted_at",null).eq("business_date",selected),
   ]);
   if(deviceList.error||proof.error||expenses.error||payouts.error||cashMoves.error)
    throw deviceList.error||proof.error||expenses.error||payouts.error||cashMoves.error;
   setRows(loaded);setDevices((deviceList.data||[]) as Device[]);
   setCashExpenseRows((expenses.data||[]) as typeof cashExpenseRows);
   setCashPayoutRows((payouts.data||[]) as typeof cashPayoutRows);
   setMovements((cashMoves.data||[]) as typeof movements);
   setSettlement((proof.data as Settlement)||null);
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)throw Error("جلسة المدير غير متاحة");
   const response=await fetch("/api/worker-links/day-report?date="+encodeURIComponent(selected),{headers:{authorization:"Bearer "+session.access_token},cache:"no-store"});
   const json=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(json.error||"تعذر تحميل تقرير العامل");
   setWorkerReport(json.report||null);setCorrections(json.corrections||[]);setCorrectionsReady(json.correctionsReady===true);
   if(json.report){
    setCashActual(old=>old||String(json.report.actual_cash));
    setPosActual(old=>old||String(json.report.terminal_total));
   }
   setError("");
  }catch(e){setError("تعذر استكمال معلومات اليوم: "+(e instanceof Error?e.message:"خطأ اتصال"));}
 },[selected,reportCorrection]);

 useEffect(()=>{
  void reloadDays();
  const timer=setInterval(()=>{setNow(new Date());if(navigator.onLine)void reloadDays();},20000);
  return()=>clearInterval(timer);
 },[reloadDays]);
 useEffect(()=>{void reloadDay();const timer=setInterval(()=>void reloadDay(),12000);return()=>clearInterval(timer)},[reloadDay]);

 async function addCashMovement(e:React.FormEvent){
  e.preventDefault();
  const value=Number(movementAmount);
  if(!selected||current?.status!=="open"||
    !Number.isFinite(value)||value<=0||toMoney(value)!==value||
    movementReason.trim().length<5){
   setError("راجع مبلغ الحركة وسببها (5 أحرف على الأقل).");return;
  }
  setMovementBusy(true);setError("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setMovementBusy(false);setError("جلسة المدير غير متاحة");return;}
  const {error}=await supabase.from("carwash_cash_movements").insert({
   business_date:selected,direction:movementDirection,amount:value,
   reason:movementReason.trim(),created_by:user.id
  });
  setMovementBusy(false);
  if(error){setError("لم تحفظ حركة الكاش: "+error.message);return;}
  setMovementAmount("");setMovementReason("");
  await reloadDay();
 }

 async function saveReportCorrection(){
  if(busy)return;
  setBusy(true);setError("");
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)throw Error("جلسة المدير غير متاحة");
   const payload=correctionPending.current||{date:selected,cash:Number(cashActual),card:Number(correctedCard),terminal:Number(posActual),reason:correctionReason,requestId:crypto.randomUUID()};
   correctionPending.current=payload;
   const r=await fetch("/api/worker-links/day-report",{method:"PATCH",headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},body:JSON.stringify(payload)});
   if(!r.ok){if(r.status<500)correctionPending.current=null;throw Error("لم يتأكد حفظ التصحيح؛ تحقق من القيم وأعد المحاولة بنفس الزر.");}
   correctionPending.current=null;setReportCorrection(false);setCorrectionReason("");
  }catch(e){setError(e instanceof Error?e.message:"تعذر التصحيح");}
  finally{setBusy(false);}
 }
 async function closeDay(){
  if(!current||current.status!=="open"||!dayIsFinished(selected,now)||busy)return;
  if(incomplete.length&&!confirmedWorkerSync){setError("أكد مراجعة الأجهزة التي لم تُنهِ المزامنة.");return;}
  const actual=Number(cashActual),network=Number(posActual);
  if(!cashActual.trim()||!posActual.trim()||
    !Number.isFinite(actual)||!Number.isFinite(network)||actual<0||network<0||
    toMoney(actual)!==actual||toMoney(network)!==network){
   setError("أدخل الكاش الفعلي وإجمالي الشبكة بأرقام صحيحة.");return;
  }
  if((cashDiff!==0||cardDiff!==0||incomplete.length>0)&&reason.trim().length<5){
   setError("اكتب سبب فرق الموازنة أو تجاوز مزامنة الأجهزة.");return;
  }
  if(!confirm("اعتماد وإقفال يوم "+selected+"؟"))return;
  setBusy(true);setError("");
  try{
   let path=managerProof?null:reportForDay?.report_object_path||null;
   if(managerProof){
    if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(managerProof.type)
     ||managerProof.size<=0||managerProof.size>10*1024*1024)
     throw Error("المرفق يجب أن يكون صورة أو PDF بحجم أقل من 10MB.");
    const ext=managerProof.type==="application/pdf"?"pdf":
     managerProof.type==="image/png"?"png":managerProof.type==="image/webp"?"webp":"jpg";
    path="day/"+selected+"/"+crypto.randomUUID()+"."+ext;
    const {error:uploadError}=await supabase.storage.from("carwash-pos-evidence")
     .upload(path,managerProof,{contentType:managerProof.type,upsert:false});
    if(uploadError)throw Error("تعذر رفع الصورة: "+uploadError.message);
   }
   const {data,error}=await supabase.rpc("carwash_manager_close_day",{
    p_date:selected,p_actual_cash:actual,p_terminal_card:network,
    p_photo_path:path,p_reason:reason.trim()||null,
    p_confirm_unsynced:incomplete.length>0&&confirmedWorkerSync
   });
   if(error)throw Error(error.message);
   if(data!=="approved")throw Error("لم يتأكد إقفال اليوم");
   setManagerProof(null);setCashActual("");setPosActual("");setReason("");setConfirmedWorkerSync(false);
   setSelected("");window.dispatchEvent(new Event("carwash:data-changed"));
   await reloadDays();
  }catch(e){setError(e instanceof Error?e.message:"فشل اعتماد الموازنة.");}
  finally{setBusy(false);}
 }
 async function managerApproveDifference(){
  if(!canApproveVariance||current?.status!=="awaiting_owner")return;
  if(!confirm("اعتماد المدير فرق يوم "+selected+"؟"))return;
  setBusy(true);
  const {error}=await supabase.rpc("approve_carwash_day_difference",{p_date:selected});
  setBusy(false);
  if(error){setError(error.message);return;}
  alert("اعتمد المدير اليوم المحدد، وبقيت بقية الأيام غير المعتمدة ظاهرة للعامل.");
  await reloadDays();await reloadDay();
 }
 async function correct(){
  if(!editing||current?.status!=="open")return;
  const c=Number(editCash),p=Number(editCard);
  if(!Number.isFinite(c)||!Number.isFinite(p)||c<0||p<0||c+p<=0){
   setError("المبلغ المصحح غير صحيح.");return;
  }
  setBusy(true);
  const {error}=await supabase.from("entries").update({
   cash_paid:c,card_paid:p,notes:editNotes,
  }).eq("id",editing.id).eq("business_date",selected);
  setBusy(false);
  if(error){setError("تعذر التصحيح: "+error.message);return;}
  setEditing(null);void reloadDay();
 }
 function startEdit(entry:Entry){
  setEditing(entry);setEditCash(String(entry.cash_paid));
  setEditCard(String(entry.card_paid));setEditNotes(entry.notes||"");
 }

 return <div className="space-y-4" dir="rtl">
  <section className="card">
   <h2 className="section-title">الموازنة اليومية — من 12 صباحًا إلى 12 صباحًا</h2>
   <p className="txt-muted">كل يوم مستقل تمامًا. يمكن أن يكون أمس غير معتمد بينما تُسجّل سيارات اليوم الجديد بشكل طبيعي. يُخفى من شاشة العامل اليوم المعتمد فقط، مع الاحتفاظ بسجلاته هنا.</p>
   <p className="txt-muted text-sm">تاريخ اليوم بتوقيت الرياض: {riyadhDayKey(now)}</p>
  </section>
  <section className="card">
   <h3 className="section-title">اختر يومًا للمراجعة</h3>
   {days.length===0?<p className="txt-warning">لا يوجد يوم محاسبي مسجل بعد. يُنشأ يوم الرياض تلقائيًا عند أول تسجيل سيارة.</p>:
    <div className="flex flex-wrap gap-2">
     {days.map(d=><button type="button" key={d.business_date}
       className={selected===d.business_date?"btn-primary":"btn-secondary"}
       aria-expanded={selected===d.business_date}
       style={d.status!=="approved"&&(d.reported||d.status==="awaiting_owner")?
        {borderColor:"#c27c14",borderWidth:2}:undefined}
       disabled={busy||reportCorrection}
       onClick={()=>{setSelected(old=>old===d.business_date?"":d.business_date);setWorkerReport(null);setManagerProof(null);setCashActual("");setPosActual("");setReason("");setConfirmedWorkerSync(false);setError("");setDetail(null);}}>
       {arabicDate(d.business_date)} · {d.status==="approved"?"✓ معتمد":d.reported||d.status==="awaiting_owner"?"⏳ بانتظار الاعتماد":"غير معتمد"}
      </button>)}
    </div>}
  </section>
  {current&&<>
   <section className="card">
    <h3 className="section-title">حسابات {selected}</h3>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
     <MetricCard tone="blue" label="السيارات" value={totals.cars} onClick={()=>setFilter("all")} />
     <div className={cashMismatch?"rounded-xl border-2 p-1":""}
      style={cashMismatch?{borderColor:"#d92d20",background:"var(--tone-red-bg)"}:undefined}>
      <MetricCard tone={cashMismatch?"red":"green"} label={cashMismatch?"⚠️ كاش — يوجد فرق":"كاش"}
       value={formatCurrency(totals.cash)} onClick={()=>setFilter("cash")} />
     </div>
     <div className={networkMismatch?"rounded-xl border-2 p-1":""}
      style={networkMismatch?{borderColor:"#d92d20",background:"var(--tone-red-bg)"}:undefined}>
      <MetricCard tone={networkMismatch?"red":"purple"} label={networkMismatch?"⚠️ شبكة — يوجد فرق":"شبكة"}
       value={formatCurrency(totals.card)} onClick={()=>setFilter("card")} />
     </div>
     <MetricCard tone="emerald" label="مخصص الفريق الجماعي" value={formatCurrency(totals.collectiveTens)} onClick={()=>setFilter("crew")} />
    </div>
    <div className="mt-3 space-y-2">{rows.map(e=>
     <button type="button" key={e.id} className="w-full flex justify-between text-start items-center border-b py-3 link-inline" onClick={()=>setDetail(e)}>
      <span>{e.car_type} · {e.service_type}</span><strong>{formatCurrency(e.cash_paid+e.card_paid)}</strong>
     </button>)}</div>
   </section>
   <section className="card space-y-3">
    <h3 className="section-title">مراجعة الكاش المتوقع قبل الموازنة</h3>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
     <MetricCard tone="green" label="الكاش المحصل" value={formatCurrency(totals.cash)} onClick={()=>setFilter("cash")}/>
     <MetricCard tone="red" label="مصروفات مدفوعة كاش" value={formatCurrency(cashExpenses)}/>
     <MetricCard tone="amber" label="دفعات عمال من الكاش" value={formatCurrency(cashWorkerPayouts)}/>
     <div className={cashMismatch?"rounded-xl border-2 p-1":""}
      style={cashMismatch?{borderColor:"#d92d20",background:"var(--tone-red-bg)"}:undefined}>
      <MetricCard tone={cashMismatch?"red":"blue"} label={cashMismatch?"⚠️ الكاش المتوقع":"الكاش المتوقع في الصندوق"}
       value={formatCurrency(expectedCash)}/>
     </div>
    </div>
    <p className="txt-muted text-sm">التحصيل الكاش − المصروفات الكاش − دفعات العمال الكاش + صافي الإيداعات والسحوبات المسجلة = رصيد الصندوق المتوقع. البيانات القديمة مجهولة مصدر الدفع لا تُخصم تلقائيًا.</p>
    <div className="space-y-2">
     {cashExpenseRows.map(e=><p key={e.id} className="border-b py-2 text-sm">{e.expense_type} · {e.notes||"—"} — <strong>{formatCurrency(e.amount)}</strong></p>)}
     {cashPayoutRows.map(e=><p key={e.id} className="border-b py-2 text-sm">دفعة عامل · {e.notes||"—"} — <strong>{formatCurrency(e.amount)}</strong></p>)}
     {movements.map(e=><p key={e.id} className="border-b py-2 text-sm">{e.direction==="in"?"كاش وارد":"كاش خارج"} · {e.reason} — <strong>{formatCurrency(e.amount)}</strong></p>)}
    </div>
    {current.status==="open"&&<form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={e=>void addCashMovement(e)}>
     <label className="form-label">نوع حركة الصندوق
      <select value={movementDirection} onChange={e=>setMovementDirection(e.target.value as "in"|"out")}>
       <option value="in">كاش وارد إلى الصندوق</option>
       <option value="out">سحب / إيداع خارج الصندوق</option>
      </select>
     </label>
     <label className="form-label">مبلغ الحركة (ر.س)
      <input type="number" min=".01" step=".01" inputMode="decimal"
       value={movementAmount} onChange={e=>setMovementAmount(e.target.value)} required/>
     </label>
     <label className="form-label sm:col-span-2">سبب حركة الكاش
      <input value={movementReason} maxLength={250} onChange={e=>setMovementReason(e.target.value)}
       placeholder="مثل إيداع كاش في البنك" required/>
     </label>
     <button className="btn-secondary sm:col-span-2" disabled={movementBusy||busy}
      type="submit">{movementBusy?"جارٍ الحفظ":"تسجيل حركة كاش منفصلة"}</button>
    </form>}
   </section>
   <section className="card">
    <h3 className="section-title">تأكيد مزامنة أجهزة هذا اليوم</h3>
    <p className="txt-muted text-sm">كل جهاز عامل مسجل يجب أن يؤكد انتهاء مزامنته لليوم السابق قبل اعتماد الموازنة.</p>
    {devices.length===0?<p className="txt-muted">لم تُسجل أجهزة لهذا اليوم.</p>:devices.map(d=>
     <div key={d.device_id} className="border-b flex justify-between py-2 gap-2">
      <span>جهاز {d.device_id.slice(0,8)}</span>
      <strong className={d.sealed_at?"txt-cash":"txt-warning"}>{d.sealed_at?"تمت المزامنة":"لم يؤكد بعد"}</strong>
     </div>)}
   </section>
   {current.status==="open"?(dayIsFinished(selected,now)?
    <section className="card space-y-3">
     <h3 className="section-title">اعتماد موازنة {selected}</h3>
     {!reportForDay&&<p className="txt-warning font-bold">بانتظار العامل: يجب أن يرسل الكاش والشبكة وصورة التقرير بعد انتهاء اليوم.</p>}
     {reportForDay&&<div className="space-y-2"><p className="txt-cash font-bold">وصل تقرير العامل والصورة</p><p>الشبكة حسب العامل: {formatCurrency(Number(reportForDay.actual_card))}</p><a href={reportForDay.imageUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary block text-center">فتح صورة تقرير جهاز الشبكة</a><img src={reportForDay.imageUrl} alt="صورة موازنة العامل" className="w-full max-h-96 object-contain rounded-lg border"/></div>}
     {reportForDay&&<section className="space-y-2" aria-label="تحديد فروقات الموازنة">
      <h4 className="font-bold">مقارنة الموازنة — المربعات الحمراء تحدد مصدر الاختلاف</h4>
      <DifferenceCard title="مراجعة الكاش" system={expectedCash}
       reported={Number(reportForDay.actual_cash)}
       systemLabel="الكاش المتوقع بعد المصروفات" reportedLabel="الكاش مع العامل"/>
      <DifferenceCard title="مراجعة الشبكة مع النظام" system={totals.card}
       reported={Number(reportForDay.actual_card)}
       systemLabel="الشبكة المسجلة" reportedLabel="الشبكة التي أدخلها العامل"/>
      <DifferenceCard title="مراجعة تقرير جهاز الشبكة"
       system={Number(reportForDay.actual_card)}
       reported={Number(reportForDay.terminal_total)}
       systemLabel="الشبكة حسب العامل" reportedLabel="الإجمالي في صورة الجهاز"/>
     </section>}
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="form-label">الكاش الموجود فعليًا<input type="number" inputMode="decimal" min="0" step=".01" value={cashActual} readOnly={!reportCorrection} onChange={e=>setCashActual(e.target.value)} className={cashMismatch?"border-2 border-red-600":""} /></label>
      <label className="form-label">إجمالي تقرير جهاز الشبكة<input type="number" inputMode="decimal" min="0" step=".01" value={posActual} readOnly={!reportCorrection} onChange={e=>setPosActual(e.target.value)} className={networkMismatch?"border-2 border-red-600":""} /></label>
     </div>
     {reportForDay&&correctionsReady&&!reportCorrection&&<button className="btn-secondary" type="button" onClick={()=>{setCorrectedCard(String(reportForDay.actual_card));setReportCorrection(true);}}>تصحيح تقرير الموازنة مع حفظ الأصل</button>}
     {reportCorrection&&<div className="space-y-3">
      <label className="form-label">الشبكة المصححة<input type="number" min="0" step=".01" value={correctedCard} onChange={e=>setCorrectedCard(e.target.value)}/></label>
      <label className="form-label">سبب التصحيح<textarea value={correctionReason} maxLength={500} onChange={e=>setCorrectionReason(e.target.value)}/></label>
      <button className="btn-primary" type="button" disabled={busy||correctionReason.trim().length<5} onClick={()=>void saveReportCorrection()}>حفظ نسخة التصحيح</button>
      {!correctionPending.current&&<button className="btn-secondary" type="button" onClick={()=>setReportCorrection(false)}>إلغاء</button>}
     </div>}
     {corrections.map(c=><p key={c.id} className="txt-muted text-sm">تصحيح {c.version}: {c.reason} — كاش {c.actual_cash}، شبكة {c.actual_card}، جهاز {c.terminal_total}</p>)}
     <div className="rounded-xl p-3" style={{background:"var(--surface-3)"}}>
      <p>الكاش المسجل: {formatCurrency(totals.cash)}</p>
      <p>المصروفات والدفعات النقدية: {formatCurrency(cashExpenses+cashWorkerPayouts)}</p>
      <p>صافي حركة الصندوق: {formatCurrency(movementNet)}</p>
      <p className="font-bold">الكاش المتوقع: {formatCurrency(expectedCash)}</p>
      <p>فرق الكاش: {cashDiff===null?"—":formatCurrency(cashDiff)} · فرق الشبكة: {cardDiff===null?"—":formatCurrency(cardDiff)}</p>
      {cashActual.trim()!==""&&posActual.trim()!==""&&<p className="mt-1">الموازنة الفعلية (كاش + شبكة): {formatCurrency(Number(cashActual)+Number(posActual))}</p>}
     </div>
     {hasVariance&&<label className="form-label">سبب الفرق<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} /></label>}
     <label className="flex items-start gap-3 rounded-xl border p-3 text-sm leading-relaxed" style={{borderColor:"var(--border)",background:"var(--surface-2)"}}>
      <input type="checkbox" className="mt-1" checked={confirmedWorkerSync} onChange={e=>setConfirmedWorkerSync(e.target.checked)}/>
      <span>تأكدت من العمال أن سيارات هذا اليوم أُرسلت إلى النظام، ولا توجد تسجيلات معلّقة على أجهزتهم. رابط العامل لا يكشف العمليات المحفوظة دون إنترنت.</span>
     </label>
     <button type="button" className="btn-primary w-full" disabled={busy||reportCorrection||incomplete.length>0||!confirmedWorkerSync||!reportForDay} onClick={()=>void closeDay()}>
      {busy?"جارٍ الاعتماد":"اعتماد هذا اليوم فقط"}
     </button>
    </section>:<section className="card"><p className="txt-muted">يوم {selected} لم ينتهِ بعد. يمكن مراجعته ولكن لا يعتمد قبل 12 صباحًا بتوقيت الرياض.</p></section>):
    <section className="card space-y-3">
     <h3 className="section-title">{current.status==="approved"?"أرشيف اليوم المعتمد":"بانتظار الاعتماد — مراجعة الفرق المالي"}</h3>
     {reportForDay&&<div className="space-y-2"><p>الشبكة حسب العامل: {formatCurrency(Number(reportForDay.actual_card))}</p><a className="btn-secondary block text-center" href={reportForDay.imageUrl} target="_blank" rel="noopener noreferrer">عرض صورة موازنة العامل</a></div>}
     {settlement?<><p>الكاش المسجل: {formatCurrency(settlement.recorded_cash)} · الكاش الفعلي: {formatCurrency(settlement.actual_cash)}</p>
      <p>الشبكة المسجلة: {formatCurrency(settlement.recorded_card)} · تقرير الشبكة: {formatCurrency(settlement.terminal_card)}</p>
      <p>فرق الكاش: {formatCurrency(settlement.cash_difference)} · فرق الشبكة: {formatCurrency(settlement.card_difference)}</p>
      {settlement.difference_reason&&<p>سبب الفرق: {settlement.difference_reason}</p>}
      <p className="txt-muted text-sm">الأصل المالي محفوظ وغير قابل للتعديل بعد الاعتماد. مرفق الجهاز خاص بالإدارة.</p></>:null}
     {current.status==="awaiting_owner"&&canApproveVariance&&
      <button className="btn-primary w-full" type="button" disabled={busy} onClick={()=>void managerApproveDifference()}>اعتماد فرق اليوم كمدير</button>}
    </section>}
  </>}
  {error&&<div className="card"><p role="alert" className="txt-danger">{error}</p></div>}
  {filter&&<Modal title="تفاصيل القيود اليومية" onClose={()=>setFilter(null)}>
   {filtered.map(e=><button type="button" key={e.id} className="w-full text-start border-b py-2" onClick={()=>{setFilter(null);setDetail(e);}}>
    {e.car_type} · {e.service_type} · كاش {formatCurrency(e.cash_paid)} · شبكة {formatCurrency(e.card_paid)} · عشرات 10 ر.س
   </button>)}
  </Modal>}
  {detail&&<Modal title="تفاصيل عملية السيارة" onClose={()=>setDetail(null)}>
   <p>{detail.car_type} · {detail.service_type}</p>
   <p>الوقت بتوقيت الرياض: {new Date(detail.occurred_at).toLocaleString("ar-SA-u-ca-gregory-nu-latn",{timeZone:"Asia/Riyadh",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})}</p>
   <p>كاش {formatCurrency(detail.cash_paid)} · شبكة {formatCurrency(detail.card_paid)} · خصم {formatCurrency(detail.discount_amount||0)}</p>
   {detail.notes&&<p>الملاحظات: {detail.notes}</p>}
   {current?.status==="open"&&<button type="button" className="btn-secondary w-full mt-3" onClick={()=>{startEdit(detail);setDetail(null);}}>تصحيح العملية قبل الاعتماد</button>}
  </Modal>}
  {editing&&<Modal title="تصحيح مالي موثق" onClose={()=>setEditing(null)}>
   <div className="space-y-3">
    <label className="form-label">كاش<input type="number" min="0" step=".01" value={editCash} onChange={e=>setEditCash(e.target.value)} /></label>
    <label className="form-label">شبكة<input type="number" min="0" step=".01" value={editCard} onChange={e=>setEditCard(e.target.value)} /></label>
    <label className="form-label">ملاحظات<input value={editNotes} onChange={e=>setEditNotes(e.target.value)} /></label>
    <button className="btn-primary" type="button" disabled={busy} onClick={()=>void correct()}>حفظ التصحيح وسجل التدقيق</button>
   </div>
  </Modal>}
 </div>;
}
