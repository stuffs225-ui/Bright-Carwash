"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {fetchAllRows} from "@/lib/fetchAll";
import {AR_GREGORIAN_LOCALE,formatCurrency} from "@/lib/business";
import {showToast} from "@/lib/toast";
import type {Expense} from "@/lib/types";
import {canonicalExpenseType,EXPENSE_QUICK_CHOICES} from "@/lib/expenseCategories";
import {ArabicDateField} from "./ArabicDateField";
import {enqueue} from "@/lib/offlineQueue";
import {isNetworkError} from "@/lib/offlineSync";
import {riyadhDate,expenseEffectiveTimestamp,lateExpenseMonth} from "@/lib/expenseDates";
import {riyadhDayKey} from "@/lib/carwashCalendarDay";

const isWage=(type:string)=>/راتب|رواتب/.test(type);
const expenseDay=(timestamp:string)=>new Date(timestamp).toLocaleDateString("en-GB",{timeZone:"Asia/Riyadh"});
const monthKey=(stamp:string)=>riyadhDayKey(new Date(stamp)).slice(0,7);
type PaySource="cash"|"network"|"bank"|"other";
const SOURCE_LABELS:{value:PaySource;label:string}[]=[
 {value:"cash",label:"كاش"},
 {value:"network",label:"شبكة"},
 {value:"bank",label:"تحويل"},
 {value:"other",label:"مصدر آخر"}
];

export function ExpensesTab(){
 const [expenseTypes,setExpenseTypes]=useState<{name:string;color:string}[]>([]);
 const [expenses,setExpenses]=useState<Expense[]>([]);
 const [selectedMonth,setSelectedMonth]=useState("");
 const [expenseType,setExpenseType]=useState("");
 const [amount,setAmount]=useState("");
 const [notes,setNotes]=useState("");
 const [expenseDate,setExpenseDate]=useState(riyadhDate);
 const [paymentSource,setPaymentSource]=useState<PaySource>("cash");
 const [customLabel,setCustomLabel]=useState("");
 const [showOtherType,setShowOtherType]=useState(false);
 const [submitting,setSubmitting]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [search,setSearch]=useState("");
 const [visibleCount,setVisibleCount]=useState(20);
 const loadTypes=useCallback(async()=>{
  const {data}=await supabase.from("expense_types").select("name,color").eq("active",true).order("sort_order");
  setExpenseTypes(data||[]);
 },[]);
 const loadExpenses=useCallback(async()=>{
  const data=await fetchAllRows<Expense>((from,to)=>
   supabase.from("expenses").select("*").is("deleted_at",null)
    .order("occurred_at",{ascending:false}).range(from,to));
  setExpenses(data);setLoaded(true);
 },[]);
 useEffect(()=>{
  void loadTypes();void loadExpenses();
  const changes=supabase.channel("expenses-simple-changes")
   .on("postgres_changes",{event:"*",schema:"public",table:"expenses"},()=>void loadExpenses())
   .subscribe();
  const onChange=()=>void loadExpenses();
  window.addEventListener("carwash:data-changed",onChange);
  return()=>{supabase.removeChannel(changes);window.removeEventListener("carwash:data-changed",onChange);};
 },[loadExpenses,loadTypes]);
 const summary=useMemo(()=>{
  const groups=new Map<string,{name:string;total:number;entries:Expense[];types:Record<string,number>}>();
  for(const exp of expenses){
   const month=monthKey(exp.occurred_at);
   let current=groups.get(month);
   if(!current){
    current={name:new Date(exp.occurred_at).toLocaleDateString(AR_GREGORIAN_LOCALE,{
     timeZone:"Asia/Riyadh",month:"long",year:"numeric"}),total:0,entries:[],types:{}};
    groups.set(month,current);
   }
   const type=canonicalExpenseType(exp.expense_type,exp.notes);
   current.total+=Number(exp.amount);
   current.types[type]=(current.types[type]||0)+Number(exp.amount);
   current.entries.push(exp);
  }
  return groups;
 },[expenses]);
 const months=useMemo(()=>[...summary.keys()].sort().reverse(),[summary]);
 const activeMonth=selectedMonth&&summary.has(selectedMonth)?selectedMonth:months[0]||"";
 const current=summary.get(activeMonth);
 const records=(current?.entries||[]).filter(e=>
  !search.trim()||[e.expense_type,e.notes||"",String(e.amount)]
   .join(" ").toLowerCase().includes(search.trim().toLowerCase()));
 const selectedQuick=EXPENSE_QUICK_CHOICES.find(q=>q.category===expenseType&&q.note===notes);
 function selectQuick(choice:typeof EXPENSE_QUICK_CHOICES[number]){
  setExpenseType(choice.category);
  setNotes(choice.note);
  setCustomLabel("");
  setShowOtherType(false);
  const last=expenses.find(e=>
   (e.expense_type===choice.category||
    canonicalExpenseType(e.expense_type)===canonicalExpenseType(choice.category))&&
   (!choice.note||String(e.notes||"").includes(choice.note)));
  setAmount(last?String(last.amount):"");
 }
 function resetForm(){
  setExpenseType("");setAmount("");setNotes("");setCustomLabel("");
  setExpenseDate(riyadhDate());setPaymentSource("cash");setShowOtherType(false);
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();
  const value=Number(amount);
  if(!expenseType){showToast("اختر المصروف.","warning");return;}
  if(isWage(expenseType)){
   showToast("الرواتب والدفعات من صفحة العمال والرواتب لمنع التكرار.","warning");return;
  }
  if(!Number.isFinite(value)||value<=0||Math.abs(Math.round(value*100)/100-value)>0.000001){
   showToast("أدخل مبلغًا صحيحًا.","warning");return;
  }
  if(lateExpenseMonth(expenseDate)&&notes.trim().length<5){
   showToast("لمصروف شهر سابق، اكتب السبب في تفاصيل المصروف.","warning");return;
  }
  if(canonicalExpenseType(expenseType)==="مصروفات أخرى"&&!customLabel.trim()&&!notes.trim()){
   showToast("اكتب وصف المصروف.","warning");return;
  }
  const fullNotes=canonicalExpenseType(expenseType)==="مصروفات أخرى"&&customLabel.trim()
   ?customLabel.trim()+(notes.trim()?" — "+notes.trim():""):notes.trim();
  const payload={
   expense_type:expenseType,amount:value,notes:fullNotes||null,
   occurred_at:expenseEffectiveTimestamp(expenseDate),
   client_recorded_at:new Date().toISOString(),
   salary_worker_id:null,salary_payment_source:null,
   payment_source:paymentSource,recognition_kind:"operating",
   client_mutation_id:crypto.randomUUID()
  };
  setSubmitting(true);
  try{
   if(!navigator.onLine){
    enqueue("expenses",payload);
    showToast("حُفظ المصروف على الجهاز؛ سيُزامن تلقائيًا عند عودة الإنترنت.","warning");
    resetForm();return;
   }
   const {error}=await supabase.from("expenses").insert(payload);
   if(error){
    if(isNetworkError(error)){
     enqueue("expenses",payload);
     showToast("حُفظ المصروف على الجهاز وسيُزامن عند عودة الإنترنت.","warning");
     resetForm();return;
    }
    showToast("تعذر حفظ المصروف: "+error.message,"error");return;
   }
   showToast("تم تسجيل المصروف.");
   setSelectedMonth(expenseDate.slice(0,7));
   resetForm();
   window.dispatchEvent(new Event("carwash:data-changed"));
   void loadExpenses();
  }finally{setSubmitting(false);}
 }
 async function removeExpense(exp:Expense){
  if(exp.crew_business_date||exp.salary_worker_id){
   showToast("هذا القيد مرتبط بالأجور؛ لا يُحذف من سجل المصروفات.","warning");return;
  }
  if(!confirm("إلغاء هذا المصروف؟ سيبقى أثر التعديل محفوظًا."))return;
  const {error}=await supabase.from("expenses")
   .update({deleted_at:new Date().toISOString()}).eq("id",exp.id);
  if(error){showToast("تعذر إلغاء المصروف: "+error.message,"error");return;}
  showToast("تم إلغاء المصروف.");setEditingId(null);void loadExpenses();
 }
 async function updateExpense(exp:Expense,patch:{expense_type:string;amount:number;notes:string}){
  if(exp.crew_business_date||exp.salary_worker_id||isWage(patch.expense_type)){
   showToast("القيود المرتبطة بالأجور تعدّل من حسابات العمال فقط.","warning");return;
  }
  if(!Number.isFinite(patch.amount)||patch.amount<=0||
    Math.abs(Math.round(patch.amount*100)/100-patch.amount)>0.000001){
   showToast("المبلغ غير صحيح.","warning");return;
  }
  const {error}=await supabase.from("expenses")
   .update({expense_type:patch.expense_type,amount:patch.amount,notes:patch.notes||null})
   .eq("id",exp.id);
  if(error){showToast("تعذر التعديل: "+error.message,"error");return;}
  setEditingId(null);showToast("تم تعديل المصروف.");void loadExpenses();
 }
 return <div className="space-y-3">
  <section className="card space-y-4">
   <h2 className="section-title mb-0">تسجيل مصروف</h2>
   <form className="space-y-4" onSubmit={e=>void submit(e)}>
    <div>
     <p className="form-label">نوع المصروف</p>
     <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {EXPENSE_QUICK_CHOICES.map(q=><button type="button" key={q.name}
       className={selectedQuick===q?"btn-primary p-3":"btn-secondary p-3"}
       aria-pressed={selectedQuick===q}
       onClick={()=>selectQuick(q)}>{q.name}</button>)}
     </div>
    </div>
    <details className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
     <summary className="font-semibold cursor-pointer">فئة أخرى من القائمة</summary>
     <label className="form-label mt-3">الفئة
      <select value={expenseType} onChange={e=>{
       setExpenseType(e.target.value);setNotes("");setCustomLabel("");
       setAmount("");setShowOtherType(true);
      }}>
       <option value="">اختر فئة</option>
       {expenseTypes.filter(x=>!isWage(x.name)).map(x=>
        <option key={x.name} value={x.name}>{x.name}</option>)}
      </select>
     </label>
    </details>
    {(canonicalExpenseType(expenseType)==="مصروفات أخرى"||showOtherType&&expenseType==="اخرى")&&
     <label className="form-label">وصف المصروف
      <input maxLength={120} value={customLabel} onChange={e=>setCustomLabel(e.target.value)}
       placeholder="مثلاً رسوم أو مشتريات أخرى"/>
     </label>}
    <label className="form-label">المبلغ (ر.س)
     <input type="number" inputMode="decimal" min=".01" step=".01" placeholder="0.00"
      required value={amount} onChange={e=>setAmount(e.target.value)}/>
    </label>
    <details className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
     <summary className="font-semibold cursor-pointer">التاريخ والدفع والملاحظات</summary>
     <div className="space-y-3 mt-3">
      <label className="form-label">تاريخ المصروف
       <ArabicDateField value={expenseDate} onChange={setExpenseDate}
        ariaLabel="تاريخ المصروف" max={riyadhDate()}/>
      </label>
      {lateExpenseMonth(expenseDate)&&<p className="txt-warning text-sm">
       هذا المصروف يخص شهرًا سابقًا؛ اكتب السبب أدناه.
      </p>}
      <label className="form-label">طريقة دفع المصروف
       <select value={paymentSource} onChange={e=>setPaymentSource(e.target.value as PaySource)}>
        {SOURCE_LABELS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
       </select>
      </label>
      <label className="form-label">ملاحظات
       <input value={notes} maxLength={500} onChange={e=>setNotes(e.target.value)}
        placeholder="اختياري"/>
      </label>
     </div>
    </details>
    <button type="submit" className="btn-primary w-full py-3 text-lg"
     disabled={submitting||!expenseType||isWage(expenseType)}>
     {submitting?"جارٍ الحفظ...":"حفظ المصروف"}
    </button>
   </form>
  </section>
  <section className="card space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h2 className="section-title mb-0">مصروفات الشهر</h2>
    <select className="max-w-40" aria-label="شهر المصروفات"
     value={activeMonth} onChange={e=>{setSelectedMonth(e.target.value);setVisibleCount(20);}}>
     {months.length===0?<option value="">هذا الشهر</option>:months.map(k=>
      <option key={k} value={k}>{summary.get(k)?.name||k}</option>)}
    </select>
   </div>
   {!loaded?<p className="txt-muted">جارٍ تحميل المصروفات...</p>:<div className="grid grid-cols-2 gap-2">
    <div className="rounded-xl tone-red p-3">
     <span className="text-xs block">الإجمالي</span>
     <strong className="text-xl" dir="ltr">{formatCurrency(current?.total||0)}</strong>
    </div>
    <div className="rounded-xl tone-slate p-3">
     <span className="text-xs block">عدد المصروفات</span>
     <strong className="text-xl">{current?.entries.length||0}</strong>
    </div>
   </div>}
   <details className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
    <summary className="font-semibold cursor-pointer">توزيع المصروفات حسب النوع</summary>
    <div className="space-y-2 mt-3">
     {Object.entries(current?.types||{}).sort((a,b)=>b[1]-a[1]).map(([name,value])=>
      <div key={name} className="flex items-center justify-between gap-2 border-b py-2">
       <span>{name}</span><strong dir="ltr">{formatCurrency(value)}</strong>
      </div>)}
     {!current&&<p className="txt-muted">لا توجد مصروفات لهذا الشهر.</p>}
    </div>
   </details>
   <details className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
    <summary className="font-semibold cursor-pointer">سجل المصروفات ({current?.entries.length||0})</summary>
    <div className="space-y-3 mt-3">
     {(current?.entries.length||0)>8&&<input type="search" aria-label="البحث في المصروفات"
      placeholder="بحث عن مصروف..." value={search}
      onChange={e=>{setSearch(e.target.value);setVisibleCount(20);}}/>}
     {records.length===0?<p className="txt-muted">لا توجد مصروفات.</p>:
      records.slice(0,visibleCount).map(exp=><ExpenseItem key={exp.id} expense={exp}
       types={expenseTypes.filter(x=>!isWage(x.name)).map(x=>x.name)}
       editing={editingId===exp.id}
       onEdit={()=>setEditingId(exp.id)} onCancel={()=>setEditingId(null)}
       onSave={patch=>void updateExpense(exp,patch)}
       onDelete={()=>void removeExpense(exp)}/>)}
     {records.length>visibleCount&&<button type="button" className="btn-secondary w-full"
      onClick={()=>setVisibleCount(n=>n+20)}>عرض المزيد ({records.length-visibleCount})</button>}
    </div>
   </details>
  </section>
 </div>;
}

function ExpenseItem({expense,types,editing,onEdit,onCancel,onSave,onDelete}:{
 expense:Expense;types:string[];editing:boolean;onEdit:()=>void;onCancel:()=>void;
 onSave:(patch:{expense_type:string;amount:number;notes:string})=>void;onDelete:()=>void
}){
 const [type,setType]=useState(expense.expense_type);
 const [amount,setAmount]=useState(String(expense.amount));
 const [notes,setNotes]=useState(expense.notes||"");
 const locked=!!expense.crew_business_date||!!expense.salary_worker_id;
 return <div className="border-b pb-3 space-y-2" style={{borderColor:"var(--border)"}}>
  {!editing?<div className="flex justify-between items-start gap-3">
   <div className="min-w-0">
    <strong className="block">{canonicalExpenseType(expense.expense_type,expense.notes)}</strong>
    <p className="txt-muted text-xs">{expenseDay(expense.occurred_at)}</p>
    {expense.notes&&<p className="txt-muted text-sm break-words">{expense.notes}</p>}
   </div>
   <div className="text-end shrink-0">
    <strong className="txt-expense block" dir="ltr">{formatCurrency(expense.amount)}</strong>
    {locked?<span className="txt-muted text-xs">قيد أجور مرتبط</span>:
    <div className="flex gap-3 justify-end mt-1 text-xs">
     <button type="button" className="link-inline" onClick={onEdit}>تعديل</button>
     <button type="button" className="txt-danger" onClick={onDelete}>إلغاء</button>
    </div>}
   </div>
  </div>:<form className="space-y-3 p-3 rounded-xl"
   style={{background:"var(--surface-2)"}} onSubmit={e=>{
    e.preventDefault();onSave({expense_type:type,amount:Number(amount),notes});
   }}>
   <label className="form-label">فئة المصروف
    <select value={type} onChange={e=>setType(e.target.value)}>
     {(!types.includes(type)?[type,...types]:types).map(t=><option key={t} value={t}>{t}</option>)}
    </select>
   </label>
   <label className="form-label">المبلغ
    <input type="number" inputMode="decimal" min=".01" step=".01"
     value={amount} onChange={e=>setAmount(e.target.value)} required/>
   </label>
   <label className="form-label">ملاحظات
    <input value={notes} onChange={e=>setNotes(e.target.value)}/>
   </label>
   <div className="grid grid-cols-2 gap-2">
    <button type="submit" className="btn-primary">حفظ التعديل</button>
    <button type="button" className="btn-secondary" onClick={onCancel}>رجوع</button>
   </div>
  </form>}
 </div>;
}
