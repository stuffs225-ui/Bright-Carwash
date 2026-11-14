"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {showToast} from "@/lib/toast";
import type {Worker} from "@/lib/types";
import {cleanWorkerProfile,validateWorkerProfile,type EditableWorkerProfile} from "@/lib/workerProfileRules";

const fullName=(name:string)=>name.trim();
const actionClass="btn-secondary text-sm";
type Props={focusWorkerId?:string;startQuickAdd?:boolean};
const toDraft=(w:Worker):EditableWorkerProfile=>({
 name:w.name,worker_type:w.worker_type||"worker",hourly_rate:Number(w.hourly_rate||0),
 notes:w.notes||null,sort_order:w.sort_order||0,active:w.active
});
const changeEvent=()=>window.dispatchEvent(new Event("carwash:data-changed"));

export function WorkerDirectorySettings({focusWorkerId,startQuickAdd=false}:Props){
 const [workers,setWorkers]=useState<Worker[]>([]);
 const [search,setSearch]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [adding,setAdding]=useState(startQuickAdd);
 const [name,setName]=useState("");
 const [newType,setNewType]=useState<"worker"|"team">("worker");
 const [editingId,setEditingId]=useState<string|null>(null);
 const [draft,setDraft]=useState<EditableWorkerProfile|null>(null);
 const [ledgerCount,setLedgerCount]=useState<number|null>(null);
 const handledFocus=useRef<string|null>(null);
 const refresh=useCallback(async()=>{
  const {data,error}=await supabase.from("workers").select("id,name,active,sort_order,notes,worker_type,hourly_rate")
   .order("sort_order",{ascending:true}).order("name",{ascending:true});
  if(error){setError("تعذر تحميل العمال: "+error.message);setLoading(false);return;}
  setWorkers((data||[]) as Worker[]);setError("");setLoading(false);
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 function edit(worker:Worker){
  setEditingId(worker.id);setDraft(toDraft(worker));setLedgerCount(null);setError("");
  void supabase.from("worker_ledger").select("id",{count:"exact",head:true})
   .eq("worker_id",worker.id).is("deleted_at",null)
   .then(({count,error})=>{if(!error)setLedgerCount(count||0);});
 }
 useEffect(()=>{
  if(!focusWorkerId||handledFocus.current===focusWorkerId)return;
  const worker=workers.find(w=>w.id===focusWorkerId);
  if(worker){handledFocus.current=focusWorkerId;edit(worker);}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[focusWorkerId,workers]);
 const active=useMemo(()=>workers.filter(w=>w.active&&w.name.includes(search.trim())),[workers,search]);
 const archived=useMemo(()=>workers.filter(w=>!w.active&&w.name.includes(search.trim())),[workers,search]);
 async function quickAdd(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  const profile:EditableWorkerProfile={
   name:fullName(name),worker_type:newType,hourly_rate:0,notes:null,
   sort_order:Math.max(0,...workers.map(w=>w.sort_order||0))+1,active:true
  };
  const invalid=validateWorkerProfile(profile);
  if(invalid){setError(invalid);return;}
  if(workers.some(w=>w.name===profile.name)){
   setError("اسم العامل موجود بالفعل؛ افتح بياناته للتعديل أو الاسترجاع.");return;
  }
  setBusy(true);setError("");
  try{
   const {data,error}=await supabase.from("workers").insert(profile).select("id").single();
   if(error)throw Error(error.code==="23505"?"اسم العامل موجود مسبقًا.":error.message);
   setAdding(false);setName("");setNewType("worker");await refresh();changeEvent();
   showToast("تم إضافة العامل ويمكن تعديل بياناته من الإعدادات.");
   if(data?.id)handledFocus.current=null;
  }catch(e){setError(e instanceof Error?e.message:"فشل إضافة العامل");}
  finally{setBusy(false);}
 }
 async function save(e:React.FormEvent){
  e.preventDefault();
  if(!draft||!editingId||busy)return;
  const invalid=validateWorkerProfile(draft);
  if(invalid){setError(invalid);return;}
  const patch=cleanWorkerProfile(draft);
  if(workers.some(w=>w.id!==editingId&&w.name===patch.name)){
   setError("اسم العامل مستخدم مسبقًا.");return;
  }
  setBusy(true);setError("");
  try{
   const {data,error}=await supabase.from("workers").update(patch)
    .eq("id",editingId).select("id").single();
   if(error||!data)throw Error(error?.code==="23505"?"اسم العامل موجود مسبقًا.":error?.message||"تعذر تعديل العامل");
   await refresh();changeEvent();showToast("حُفظ ملف العامل بنجاح.");
   setEditingId(null);setDraft(null);
  }catch(e){setError(e instanceof Error?e.message:"فشل الحفظ");}
  finally{setBusy(false);}
 }
 async function setStatus(worker:Worker,enable:boolean){
  if(busy)return;
  if(!enable&&!window.confirm("إزالة العامل من القوائم النشطة؟ سيتم الاحتفاظ بكل كشوفه ودفعاته، ويمكن استرجاعه من الأرشيف."))return;
  setBusy(true);setError("");
  try{
   const {data,error}=await supabase.from("workers").update({active:enable})
    .eq("id",worker.id).select("id").single();
   if(error||!data)throw Error(error?.message||"تعذر تغيير حالة العامل");
   await refresh();changeEvent();
   setEditingId(null);setDraft(null);
   showToast(enable?"تم استرجاع العامل إلى القائمة النشطة.":"تمت أرشفة العامل دون حذف كشوفه المالية.");
  }catch(e){setError(e instanceof Error?e.message:"فشلت العملية");}
  finally{setBusy(false);}
 }
 return <div className="space-y-4" dir="rtl" data-testid="worker-settings-directory">
  <section className="card space-y-3">
   <div className="flex justify-between items-center gap-2">
    <div><h2 className="section-title mb-1">إدارة العمال</h2>
     <p className="txt-muted text-xs">تعديل الاسم والبيانات والحالة مباشرة · السجلات المالية محفوظة</p></div>
    <button type="button" className="btn-primary shrink-0" disabled={busy}
     onClick={()=>{setAdding(x=>!x);setEditingId(null);setError("");}}>
     {adding?"إغلاق":"+ إضافة عامل"}
    </button>
   </div>
   {adding&&<form onSubmit={e=>void quickAdd(e)} className="rounded-xl border p-3 space-y-3"
    style={{borderColor:"var(--border)"}} data-testid="worker-quick-add">
    <label className="form-label">اسم العامل
     <input autoFocus required maxLength={80} placeholder="اسم العامل الجديد" value={name}
      onChange={e=>setName(e.target.value)}/></label>
    <details><summary className="cursor-pointer txt-muted text-sm">خيارات إضافية</summary>
     <label className="form-label mt-2">النوع
      <select value={newType} onChange={e=>setNewType(e.target.value as "worker"|"team")}>
       <option value="worker">عامل</option><option value="team">فريق</option>
      </select></label>
    </details>
    <button type="submit" disabled={busy} className="btn-primary w-full">
     {busy?"جارٍ الإضافة":"حفظ العامل"}
    </button>
   </form>}
   {error&&<p role="alert" className="txt-danger text-sm">{error}</p>}
   <input type="search" aria-label="البحث عن عامل في الإعدادات" placeholder="ابحث باسم العامل..."
    value={search} onChange={e=>setSearch(e.target.value)}/>
   <div className="flex flex-wrap gap-3 txt-muted text-xs">
    <span>النشطون: {workers.filter(x=>x.active).length}</span>
    <span>المؤرشفون: {workers.filter(x=>!x.active).length}</span>
   </div>
   {loading?<p role="status" className="txt-muted">جارٍ تحميل العمال...</p>:
    active.length===0?<p className="txt-muted text-sm">{search?"لا توجد نتائج.":"لا يوجد عمال نشطون."}</p>:
    <div className="space-y-2">{active.map(w=><div key={w.id}
     className="rounded-xl border p-3 flex justify-between items-center gap-2"
     style={{borderColor:"var(--border)"}}>
     <div className="min-w-0"><strong className="block truncate">{w.name}</strong>
      <span className="txt-muted text-xs">{w.worker_type==="team"?"فريق":"عامل"} · نشط</span></div>
     <button type="button" className={actionClass} onClick={()=>edit(w)}>تعديل</button>
    </div>)}</div>}
  </section>
  {draft&&editingId&&<section className="card space-y-3" data-testid="worker-profile-editor"
   id="worker-profile-editor">
   <div className="flex justify-between items-center gap-2">
    <h3 className="section-title mb-0">بيانات {workers.find(w=>w.id===editingId)?.name||"العامل"}</h3>
    <button type="button" className="btn-secondary text-sm" onClick={()=>{setEditingId(null);setDraft(null);setError("");}}>إغلاق</button>
   </div>
   <form className="space-y-3" onSubmit={e=>void save(e)}>
    <label className="form-label">اسم العامل
     <input required maxLength={80} value={draft.name} onChange={e=>setDraft(d=>d?{...d,name:e.target.value}:d)}/></label>
    <div className="grid grid-cols-2 gap-2">
     <label className="form-label">النوع
      <select value={draft.worker_type} onChange={e=>setDraft(d=>d?{...d,worker_type:e.target.value as "worker"|"team"}:d)}>
       <option value="worker">عامل</option><option value="team">فريق</option>
      </select></label>
     <label className="form-label">الأجر بالساعة (ر.س)
      <input type="number" min="0" max="100000" step=".01" inputMode="decimal"
       value={draft.hourly_rate} onChange={e=>setDraft(d=>d?{...d,hourly_rate:Number(e.target.value)}:d)}/></label>
    </div>
    <label className="form-label">الملاحظات
     <textarea rows={2} maxLength={500} value={draft.notes||""}
      onChange={e=>setDraft(d=>d?{...d,notes:e.target.value}:d)}/></label>
    <details className="border rounded-xl p-3" style={{borderColor:"var(--border)"}}>
     <summary className="cursor-pointer txt-muted text-sm">الترتيب والحالة</summary>
     <div className="grid grid-cols-2 gap-2 mt-3">
      <label className="form-label">ترتيب الظهور
       <input type="number" min="0" max="10000" step="1" value={draft.sort_order}
        onChange={e=>setDraft(d=>d?{...d,sort_order:Number(e.target.value)}:d)}/></label>
      <label className="form-label">حالة العامل
       <select value={draft.active?"active":"archived"}
        onChange={e=>setDraft(d=>d?{...d,active:e.target.value==="active"}:d)}>
        <option value="active">نشط</option><option value="archived">مؤرشف</option>
       </select></label>
     </div>
    </details>
    {ledgerCount!==null&&<p className="txt-muted text-xs">
     عدد القيود المرتبطة بالعامل: {ledgerCount}. تعديل الملف لا يغيّر المبالغ القديمة.</p>}
    <button className="btn-primary w-full" type="submit" disabled={busy}>
     {busy?"جارٍ الحفظ":"حفظ التعديلات"}
    </button>
   </form>
   <button type="button" disabled={busy} className="btn-secondary w-full"
    onClick={()=>{const w=workers.find(x=>x.id===editingId);if(w)void setStatus(w,!w.active);}}>
    {draft.active?"حذف من القائمة (أرشفة)":"استرجاع العامل"}
   </button>
   <p className="txt-muted text-xs">الحذف الآمن يُخفي العامل من القوائم النشطة فقط، ولا يمس كشوف الحساب أو العمليات السابقة.</p>
  </section>}
  {archived.length>0&&<details className="card" data-testid="archived-workers">
   <summary className="cursor-pointer font-semibold">العمال المؤرشفون ({archived.length})</summary>
   <div className="space-y-2 mt-3">{archived.map(w=><div key={w.id}
    className="flex justify-between items-center gap-3 rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
    <div className="min-w-0"><strong className="block truncate">{w.name}</strong>
     <span className="txt-muted text-xs">مؤرشف · الحساب محفوظ</span></div>
    <div className="flex gap-2">
     <button className="btn-secondary text-xs" type="button" onClick={()=>edit(w)}>تعديل</button>
     <button className="btn-secondary text-xs" type="button" disabled={busy} onClick={()=>void setStatus(w,true)}>استرجاع</button>
    </div>
   </div>)}</div>
  </details>}
 </div>;
}
