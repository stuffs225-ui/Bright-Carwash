"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {AR_GREGORIAN_LOCALE,formatCurrency} from "@/lib/business";
import {showToast} from "@/lib/toast";
import {PAYMENT_SOURCES,addLedgerEntry,addWorker,editWorker,
 balancesByWorker,loadLedger,loadWorkers,softDeleteLedgerEntry} from "@/lib/workers";
import type {LedgerEntry,Worker} from "@/lib/types";
import {Modal} from "./Modal";

export function WorkersTab(){
 const [workers,setWorkers]=useState<Worker[]>([]);
 const [ledger,setLedger]=useState<LedgerEntry[]>([]);
 const [activeId,setActiveId]=useState<string|null>(null);
 const [newName,setNewName]=useState("");
 const [newType,setNewType]=useState<"worker"|"team">("worker");
 const [newHourlyRate,setNewHourlyRate]=useState("0");
 const [adding,setAdding]=useState(false);
 const [loading,setLoading]=useState(true);
 const [loaded,setLoaded]=useState(false);
 const [filter,setFilter]=useState("");
 const reload=useCallback(async()=>{
  try{
   const [w,l]=await Promise.all([loadWorkers(),loadLedger()]);
   setWorkers(w);setLedger(l);
  }finally{setLoading(false);setLoaded(true);}
 },[]);
 useEffect(()=>{
  void reload();
  const channel=supabase.channel("workers-simplified")
   .on("postgres_changes",{event:"*",schema:"public",table:"worker_ledger"},()=>void reload())
   .on("postgres_changes",{event:"*",schema:"public",table:"workers"},()=>void reload())
   .subscribe();
  const onChange=()=>void reload();
  window.addEventListener("carwash:data-changed",onChange);
  return()=>{supabase.removeChannel(channel);window.removeEventListener("carwash:data-changed",onChange);};
 },[reload]);
 const balances=useMemo(()=>balancesByWorker(workers,ledger),[workers,ledger]);
 const totals=useMemo(()=>({
  due:balances.reduce((sum,b)=>sum+Math.max(0,b.balance),0),
  advances:balances.reduce((sum,b)=>sum+Math.max(0,-b.balance),0),
  paid:balances.reduce((sum,b)=>sum+b.paid,0)
 }),[balances]);
 const list=balances.filter(b=>b.worker.name.includes(filter.trim()));
 const active=workers.find(w=>w.id===activeId)||null;
 async function handleAddWorker(e:React.FormEvent){
  e.preventDefault();
  if(adding||!newName.trim())return;
  const rate=Number(newHourlyRate);
  if(!Number.isFinite(rate)||rate<0){
   showToast("أدخل أجرًا صحيحًا أو صفرًا.","warning");return;
  }
  setAdding(true);
  try{
   const {error}=await addWorker(newName,workers.length+1,newType,rate);
   if(error){showToast(error.message,"error");return;}
   setNewName("");setNewType("worker");setNewHourlyRate("0");
   showToast("تمت إضافة العامل.");await reload();
  }finally{setAdding(false);}
 }
 return <div className="space-y-3">
  <section className="card space-y-3">
   <div className="flex items-center justify-between gap-2">
    <h2 className="section-title mb-0">العمال والرواتب</h2>
    <span className="txt-muted text-sm">{workers.length} عامل / فريق</span>
   </div>
   {!loaded?<p className="txt-muted">جارٍ تحميل الحسابات...</p>:<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
    <div className="rounded-xl p-3 tone-amber">
     <span className="block text-xs">المستحق للعاملين</span>
     <strong className="block text-lg" dir="ltr">{formatCurrency(totals.due)}</strong>
    </div>
    <div className="rounded-xl p-3 tone-purple">
     <span className="block text-xs">السلف</span>
     <strong className="block text-lg" dir="ltr">{formatCurrency(totals.advances)}</strong>
    </div>
    <div className="rounded-xl p-3 tone-emerald col-span-2 sm:col-span-1">
     <span className="block text-xs">المدفوع للعمال</span>
     <strong className="block text-lg" dir="ltr">{formatCurrency(totals.paid)}</strong>
    </div>
   </div>}
   {workers.length>5&&<input type="search" aria-label="البحث عن عامل"
    placeholder="ابحث عن عامل" value={filter} onChange={e=>setFilter(e.target.value)}/>}
   <div className="space-y-2">
    {loading&&!loaded?<p className="txt-muted">جارٍ تحميل العمال...</p>:
     list.length===0?<p className="txt-muted">{filter?"لا يوجد عامل بهذا الاسم.":"لا يوجد عمال مسجلون."}</p>:
     list.map(b=><button type="button" key={b.worker.id}
      className="w-full rounded-xl border px-3 py-3 flex items-center justify-between gap-3 text-start"
      style={{borderColor:"var(--border)",background:"var(--surface-2)"}}
      onClick={()=>setActiveId(b.worker.id)}>
      <div className="min-w-0">
       <strong className="block truncate">{b.worker.name}</strong>
       <span className="txt-muted text-xs">{b.worker.worker_type==="team"?"فريق":"عامل"} · عرض الحساب</span>
      </div>
      <div className="text-end shrink-0">
       <span className="block txt-muted text-xs">{b.balance>0?"له مستحقات":b.balance<0?"عليه سلفة":"الحساب متوازن"}</span>
       <strong className={b.balance<0?"txt-expense":"txt-net"} dir="ltr">{formatCurrency(Math.abs(b.balance))}</strong>
      </div>
     </button>)}
   </div>
   <details className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
    <summary className="cursor-pointer font-bold">+ إضافة عامل أو فريق</summary>
    <form onSubmit={e=>void handleAddWorker(e)} className="space-y-3 mt-3">
     <label className="form-label">الاسم
      <input required value={newName} onChange={e=>setNewName(e.target.value)} placeholder="اسم العامل"/>
     </label>
     <div className="grid grid-cols-2 gap-2">
      <label className="form-label">النوع
       <select value={newType} onChange={e=>setNewType(e.target.value as "worker"|"team")}>
        <option value="worker">عامل</option><option value="team">فريق</option>
       </select>
      </label>
      <label className="form-label">الأجر بالساعة
       <input type="number" min="0" step=".01" value={newHourlyRate} onChange={e=>setNewHourlyRate(e.target.value)}/>
      </label>
     </div>
     <button type="submit" className="btn-primary w-full" disabled={adding}>{adding?"جارٍ الحفظ...":"إضافة العامل"}</button>
    </form>
   </details>
  </section>
  {active&&<WorkerAccountModal key={active.id} worker={active}
   rows={ledger.filter(l=>l.worker_id===active.id)} onClose={()=>setActiveId(null)}
   onChanged={()=>void reload()}/>}
 </div>;
}

function WorkerAccountModal({worker,rows,onClose,onChanged}:{
 worker:Worker;rows:LedgerEntry[];onClose:()=>void;onChanged:()=>void
}){
 const [action,setAction]=useState<"earning"|"payment"|null>(null);
 const [amount,setAmount]=useState("");
 const [source,setSource]=useState("cash");
 const [notes,setNotes]=useState("");
 const [workerType,setWorkerType]=useState<"worker"|"team">(worker.worker_type||"worker");
 const [hourlyRate,setHourlyRate]=useState(String(worker.hourly_rate||0));
 const [saving,setSaving]=useState(false);
 const earned=rows.filter(r=>r.kind==="earning").reduce((a,r)=>a+Number(r.amount),0);
 const paid=rows.filter(r=>r.kind==="payment").reduce((a,r)=>a+Number(r.amount),0);
 const balance=earned-paid;
 async function saveMovement(e:React.FormEvent){
  e.preventDefault();
  if(saving||!action)return;
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0||Math.abs(Math.round(value*100)/100-value)>0.000001){
   showToast("أدخل مبلغًا صحيحًا.","warning");return;
  }
  setSaving(true);
  try{
   const {error}=await addLedgerEntry({
    worker_id:worker.id,kind:action,amount:value,
    payment_source:action==="payment"?source:null,notes:notes.trim()||null
   });
   if(error){showToast("تعذر حفظ الحركة: "+error.message,"error");return;}
   setAmount("");setNotes("");setAction(null);
   showToast("تم حفظ الحركة.");onChanged();
  }finally{setSaving(false);}
 }
 async function saveWorker(e:React.FormEvent){
  e.preventDefault();
  const rate=Number(hourlyRate);
  if(saving||!Number.isFinite(rate)||rate<0){showToast("الأجر غير صحيح.","warning");return;}
  setSaving(true);
  try{
   const {error}=await editWorker(worker.id,{worker_type:workerType,hourly_rate:rate});
   if(error){showToast(error.message,"error");return;}
   showToast("تم حفظ بيانات العامل.");onChanged();
  }finally{setSaving(false);}
 }
 async function remove(row:LedgerEntry){
  if(row.expense_id){showToast("هذا القيد مرتبط بمصروف؛ عدّل المصروف من مصدره لتجنب التكرار.","warning");return;}
  if(!confirm("إلغاء هذه الحركة المالية؟"))return;
  const {error}=await softDeleteLedgerEntry(row.id);
  if(error){showToast("تعذر إلغاء القيد: "+error.message,"error");return;}
  showToast("تم إلغاء الحركة.");onChanged();
 }
 return <Modal title={worker.name} onClose={onClose}>
  <div className="space-y-3" dir="rtl">
   <div className="grid grid-cols-2 gap-2">
    <div className="rounded-xl p-3 tone-blue">
     <span className="block text-xs">الرصيد {balance>=0?"المستحق":"السلفة"}</span>
     <strong dir="ltr" className="block text-lg">{formatCurrency(Math.abs(balance))}</strong>
    </div>
    <div className="rounded-xl p-3 tone-emerald">
     <span className="block text-xs">إجمالي المدفوع</span>
     <strong dir="ltr" className="block text-lg">{formatCurrency(paid)}</strong>
    </div>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <button type="button" className={action==="earning"?"btn-primary":"btn-secondary"}
     onClick={()=>setAction(action==="earning"?null:"earning")}>+ مستحق له</button>
    <button type="button" className={action==="payment"?"btn-primary":"btn-secondary"}
     onClick={()=>setAction(action==="payment"?null:"payment")}>+ دفعة / سلفة</button>
   </div>
   {action&&<form className="border rounded-xl p-3 space-y-3"
    style={{borderColor:"var(--border)"}} onSubmit={e=>void saveMovement(e)}>
    <label className="form-label">المبلغ (ر.س)
     <input autoFocus type="number" inputMode="decimal" min=".01" step=".01"
      required value={amount} onChange={e=>setAmount(e.target.value)}/>
    </label>
    {action==="payment"&&<label className="form-label">مصدر الدفع
     <select value={source} onChange={e=>setSource(e.target.value)}>
      {PAYMENT_SOURCES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
     </select>
    </label>}
    <label className="form-label">ملاحظة (اختياري)
     <input value={notes} onChange={e=>setNotes(e.target.value)}/>
    </label>
    <button type="submit" className="btn-primary w-full" disabled={saving}>
     {saving?"جارٍ الحفظ...":action==="earning"?"تسجيل المستحق":"تسجيل الدفعة"}
    </button>
   </form>}
   <details className="border rounded-xl p-3" style={{borderColor:"var(--border)"}}>
    <summary className="font-bold cursor-pointer">كشف الحساب ({rows.length})</summary>
    <div className="space-y-2 mt-3">
     {rows.length===0?<p className="txt-muted text-sm">لا توجد حركات مسجلة.</p>:rows.map(row=>
      <div key={row.id} className="border-b py-2 flex justify-between gap-2 items-start">
       <div>
        <span className="block text-sm">{row.kind==="earning"?"مستحق":"دفعة"} · {
         new Date(row.occurred_at).toLocaleDateString(AR_GREGORIAN_LOCALE,{
          timeZone:"Asia/Riyadh",year:"numeric",month:"short",day:"numeric"})}</span>
        {row.notes&&<p className="txt-muted text-xs">{row.notes}</p>}
        {row.payment_source&&<span className="txt-muted text-xs">{
         PAYMENT_SOURCES.find(x=>x.value===row.payment_source)?.label||row.payment_source}</span>}
       </div>
       <div className="text-end shrink-0">
        <strong dir="ltr" className={row.kind==="earning"?"txt-net":"txt-expense"}>{formatCurrency(row.amount)}</strong>
        {!row.expense_id&&<button type="button" className="block text-xs txt-danger mt-1"
         onClick={()=>void remove(row)}>إلغاء الحركة</button>}
       </div>
      </div>)}
    </div>
   </details>
   <details className="border rounded-xl p-3" style={{borderColor:"var(--border)"}}>
    <summary className="font-bold cursor-pointer">بيانات العامل</summary>
    <form onSubmit={e=>void saveWorker(e)} className="space-y-3 mt-3">
     <label className="form-label">النوع
      <select value={workerType} onChange={e=>setWorkerType(e.target.value as "worker"|"team")}>
       <option value="worker">عامل</option><option value="team">فريق</option>
      </select>
     </label>
     <label className="form-label">الأجر بالساعة
      <input type="number" min="0" step=".01" value={hourlyRate} onChange={e=>setHourlyRate(e.target.value)}/>
     </label>
     <button type="submit" className="btn-secondary w-full" disabled={saving}>حفظ بيانات العامل</button>
    </form>
   </details>
   {worker.worker_type==="team"&&<p className="txt-muted text-xs">
    مخصص الغسيل الجماعي يُحسب تلقائيًا في مصروفات المغسلة ولا يُصرف للفريق نقدًا إلا عند تسجيل دفعة.
   </p>}
  </div>
 </Modal>;
}
