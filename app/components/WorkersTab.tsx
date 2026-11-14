"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {AR_GREGORIAN_LOCALE,formatCurrency} from "@/lib/business";
import {showToast} from "@/lib/toast";
import {PAYMENT_SOURCES,addLedgerEntry,addWorker,
 balancesByWorker,loadLedger,loadWorkers,softDeleteLedgerEntry} from "@/lib/workers";
import type {LedgerEntry,Worker} from "@/lib/types";
import {Modal} from "./Modal";
import {openWorkerSettings} from "@/lib/carwashSettingsNavigation";

export function WorkersTab(){
 const [workers,setWorkers]=useState<Worker[]>([]);
 const [ledger,setLedger]=useState<LedgerEntry[]>([]);
 const [activeId,setActiveId]=useState<string|null>(null);
 const [newName,setNewName]=useState("");
 const [showAdd,setShowAdd]=useState(false);
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
 const list=balances.filter(b=>b.worker.active&&b.worker.name.includes(filter.trim()));
 const archived=balances.filter(b=>!b.worker.active);
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
   setNewName("");setNewType("worker");setNewHourlyRate("0");setShowAdd(false);
   showToast("تمت إضافة العامل.");await reload();
  }finally{setAdding(false);}
 }
 return <div className="space-y-3">
  <section className="card space-y-3">
   <div className="flex items-center justify-between gap-2">
    <div><h2 className="section-title mb-0">العمال والرواتب</h2>
     <span className="txt-muted text-xs">{workers.filter(w=>w.active).length} نشط · {archived.length} مؤرشف</span></div>
    <button type="button" className="btn-primary shrink-0"
     onClick={()=>setShowAdd(x=>!x)}>{showAdd?"إغلاق":"+ إضافة عامل"}</button>
   </div>
   {showAdd&&<form onSubmit={e=>void handleAddWorker(e)}
    className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--border)"}}>
    <label className="form-label">اسم العامل
     <input autoFocus required maxLength={80} value={newName}
      onChange={e=>setNewName(e.target.value)} placeholder="اسم العامل"/></label>
    <details><summary className="cursor-pointer txt-muted text-sm">خيارات إضافية</summary>
     <div className="grid grid-cols-2 gap-2 mt-2">
      <label className="form-label">النوع
       <select value={newType} onChange={e=>setNewType(e.target.value as "worker"|"team")}>
        <option value="worker">عامل</option><option value="team">فريق</option>
       </select></label>
      <label className="form-label">الأجر بالساعة
       <input type="number" min="0" step=".01" value={newHourlyRate}
        onChange={e=>setNewHourlyRate(e.target.value)}/></label>
     </div>
    </details>
    <button type="submit" className="btn-primary w-full" disabled={adding}>
     {adding?"جارٍ الحفظ":"حفظ العامل"}</button>
   </form>}
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
     list.map(b=><div key={b.worker.id}
      className="w-full rounded-xl border px-3 py-3 flex items-center justify-between gap-3 text-start"
      style={{borderColor:"var(--border)",background:"var(--surface-2)"}}>
      <button type="button" className="min-w-0 flex-1 text-start flex items-center justify-between gap-2"
       onClick={()=>setActiveId(b.worker.id)}>
       <div className="min-w-0">
        <strong className="block truncate">{b.worker.name}</strong>
        <span className="txt-muted text-xs">{b.worker.worker_type==="team"?"فريق":"عامل"} · كشف الحساب</span>
       </div>
       <div className="text-end shrink-0">
        <span className="block txt-muted text-xs">{b.balance>0?"له مستحقات":b.balance<0?"عليه سلفة":"الحساب متوازن"}</span>
        <strong className={b.balance<0?"txt-expense":"txt-net"} dir="ltr">{formatCurrency(Math.abs(b.balance))}</strong>
       </div>
      </button>
      <button type="button" className="btn-secondary text-sm shrink-0"
       aria-label={"تعديل بيانات "+b.worker.name}
       onClick={()=>openWorkerSettings(b.worker.id)}>تعديل</button>
     </div>)}
   </div>
   {archived.length>0&&<details className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
    <summary className="cursor-pointer txt-muted text-sm">العمال المؤرشفون ({archived.length})</summary>
    <div className="space-y-2 mt-2">{archived.map(b=><div key={b.worker.id}
     className="flex justify-between items-center gap-2 border-b py-2">
     <span className="text-sm">{b.worker.name} · الرصيد {formatCurrency(b.balance)}</span>
     <button type="button" className="btn-secondary text-sm"
      onClick={()=>openWorkerSettings(b.worker.id)}>تعديل / استرجاع</button>
    </div>)}</div>
   </details>}
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
   <button type="button" className="btn-secondary w-full" onClick={()=>{
    onClose();openWorkerSettings(worker.id);
   }}>⚙️ تعديل اسم العامل وبياناته من الإعدادات</button>
   {worker.worker_type==="team"&&<p className="txt-muted text-xs">
    مخصص الغسيل الجماعي يُحسب تلقائيًا في مصروفات المغسلة ولا يُصرف للفريق نقدًا إلا عند تسجيل دفعة.
   </p>}
  </div>
 </Modal>;
}
