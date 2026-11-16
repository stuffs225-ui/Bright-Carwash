"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {fetchAllRows} from "@/lib/fetchAll";
import {formatCurrency} from "@/lib/business";
import {canonicalExpenseType} from "@/lib/expenseCategories";
import {Modal} from "./Modal";

type Source="cash"|"network"|"bank"|"other"|"mixed";
type ReviewState="investigating"|"proposed"|"reviewed"|"dismissed";
type ExpenseForReview={
 id:string;expense_type:string;amount:number;payment_source:string|null;
 notes:string|null;occurred_at:string;
};
type Review={
 id:string;expense_id:string;review_state:ReviewState;
 proposed_payment_source:Source|null;evidence_note:string|null;reviewed_at:string;
};
const labels:Record<ReviewState,string>={
 investigating:"بانتظار الاستيضاح",proposed:"مقترح تصحيح",
 reviewed:"تمت المراجعة دون تعديل",dismissed:"لا يحتاج تصحيحًا"
};
const sources:{id:Source;name:string}[]=[
 {id:"cash",name:"كاش"},{id:"network",name:"شبكة"},
 {id:"bank",name:"تحويل بنكي"},{id:"other",name:"مصدر آخر"},
 {id:"mixed",name:"مختلط — يحتاج توزيعًا موثقًا"}
];
function reasons(e:ExpenseForReview){
 const flags:string[]=[];
 if(!e.payment_source)flags.push("مصدر الدفع غير محدد");
 if(canonicalExpenseType(e.expense_type,e.notes)==="مصروفات أخرى")
  flags.push("مصروف ضمن أخرى");
 const note=String(e.notes||"");
 const cash=/كاش|cash/i.test(note),card=/شبكة|network|بطاقة|card/i.test(note);
 if(cash&&card)flags.push("ملاحظة تشير إلى أكثر من مصدر دفع");
 return flags;
}
function Reviewer({expense,review,onSaved,onClose}:{
 expense:ExpenseForReview;review?:Review;onSaved:()=>Promise<void>;onClose:()=>void;
}){
 const [status,setStatus]=useState<ReviewState>(review?.review_state||"investigating");
 const [source,setSource]=useState<Source| "">(review?.proposed_payment_source||"");
 const [note,setNote]=useState(review?.evidence_note||"");
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 async function save(e:React.FormEvent){
  e.preventDefault();if(saving)return;
  if(status==="proposed"&&(!source||note.trim().length<5)){
   setError("اقتراح التصحيح يحتاج مصدر دفع محددًا وسببًا موثقًا (5 أحرف على الأقل).");
   return;
  }
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("جلسة المدير غير متاحة.");return;}
  setSaving(true);setError("");
  const {error:write}=await supabase.from("carwash_expense_reviews").upsert({
   expense_id:expense.id,review_state:status,proposed_payment_source:source||null,
   evidence_note:note.trim()||null,reviewed_by:user.id,reviewed_at:new Date().toISOString()
  },{onConflict:"expense_id"});
  if(write){setError("تعذر حفظ المراجعة: "+write.message);setSaving(false);return;}
  await onSaved();onClose();setSaving(false);
 }
 return <Modal title="مراجعة المصروف دون تغيير القيد المالي" onClose={onClose}>
  <form className="space-y-3" onSubmit={e=>void save(e)}>
   <p className="text-sm">المصروف: <strong>{expense.expense_type}</strong> · {formatCurrency(expense.amount)}</p>
   <p className="txt-muted text-xs">المصدر المحفوظ: {expense.payment_source||"غير محدد"} · {expense.notes||"لا توجد ملاحظات"}</p>
   <label className="form-label">قرار المراجعة
    <select value={status} onChange={e=>setStatus(e.target.value as ReviewState)}>
     {Object.entries(labels).map(([id,name])=><option value={id} key={id}>{name}</option>)}
    </select>
   </label>
   <label className="form-label">مصدر الدفع المقترح (لا يغير المصروف الأصلي)
    <select value={source} onChange={e=>setSource(e.target.value as Source|"")}>
     <option value="">غير محدد</option>
     {sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
   </label>
   <label className="form-label">ملاحظات المراجعة والإثبات
    <textarea value={note} maxLength={1000} rows={3}
     onChange={e=>setNote(e.target.value)} placeholder="مصدر المعلومة والمرجع، أو سبب إبقاء المصروف دون تغيير"/>
   </label>
   {error&&<p role="alert" className="txt-danger text-sm">{error}</p>}
   <p className="txt-warning text-xs">حفظ المراجعة لا يصحح المبلغ ولا طريقة الدفع الأصلية. أي تصحيح مالي لاحق يحتاج قيدًا مستقلًا واعتمادًا.</p>
   <button type="submit" className="btn-primary w-full" disabled={saving}>
    {saving?"جارٍ الحفظ...":"حفظ قرار المراجعة"}
   </button>
  </form>
 </Modal>;
}

export function ExpenseReviewPanel(){
 const [expenses,setExpenses]=useState<ExpenseForReview[]>([]);
 const [reviews,setReviews]=useState<Review[]>([]);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState("");
 const [filter,setFilter]=useState<"pending"|"all"|"proposed"|"reviewed">("pending");
 const [query,setQuery]=useState("");
 const [visible,setVisible]=useState(20);
 const [editing,setEditing]=useState<ExpenseForReview|null>(null);
 const load=useCallback(async()=>{
  try{
   const [items,reviewRows]=await Promise.all([
    fetchAllRows<ExpenseForReview>((from,to)=>supabase.from("expenses")
     .select("id,expense_type,amount,payment_source,notes,occurred_at")
     .is("deleted_at",null).order("occurred_at",{ascending:false}).range(from,to)),
    fetchAllRows<Review>((from,to)=>supabase.from("carwash_expense_reviews")
     .select("id,expense_id,review_state,proposed_payment_source,evidence_note,reviewed_at")
     .order("reviewed_at",{ascending:false}).range(from,to))
   ]);
   setExpenses(items);setReviews(reviewRows);setError("");
  }catch(e){setError(e instanceof Error?e.message:"تعذر قراءة المصروفات للمراجعة");}
  finally{setReady(true);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const reviewedById=useMemo(()=>new Map(reviews.map(x=>[x.expense_id,x])),[reviews]);
 const flagged=useMemo(()=>expenses.filter(e=>reasons(e).length>0),[expenses]);
 const pending=flagged.filter(e=>!reviewedById.has(e.id)||
  reviewedById.get(e.id)?.review_state==="investigating");
 const shown=flagged.filter(e=>{
  const review=reviewedById.get(e.id);
  if(filter==="pending"&&review&&review.review_state!=="investigating")return false;
  if(filter==="proposed"&&review?.review_state!=="proposed")return false;
  if(filter==="reviewed"&&(!review||!["reviewed","dismissed"].includes(review.review_state)))return false;
  return !query.trim()||[e.expense_type,e.notes||"",String(e.amount),e.occurred_at]
   .join(" ").toLowerCase().includes(query.trim().toLowerCase());
 });
 return <section className="card space-y-4" dir="rtl" data-testid="expense-review-panel">
  <div>
   <h2 className="section-title mb-1">مراجعة المصروفات والبيانات الناقصة</h2>
   <p className="txt-muted text-xs">تعرض الحالات المحتاجة للتدقيق فقط؛ لا توجد تعديلات تلقائية للعمليات أو الأيام القديمة.</p>
  </div>
  {error&&<p role="alert" className="txt-danger text-sm">{error}</p>}
  {!ready?<p className="txt-muted">جارٍ فحص المصروفات...</p>:<>
   <div className="grid grid-cols-2 gap-2 text-sm">
    <div className="rounded-xl border p-3">
     <span className="txt-muted text-xs block">تحتاج الاستيضاح</span>
     <strong>{pending.length}</strong>
    </div>
    <div className="rounded-xl border p-3">
     <span className="txt-muted text-xs block">مصروفات عليها ملاحظات</span>
     <strong>{flagged.length}</strong>
    </div>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <label className="form-label">الحالة
     <select value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setVisible(20);}}>
      <option value="pending">تحتاج مراجعة</option>
      <option value="all">جميع الحالات</option>
      <option value="proposed">مقترحات تصحيح</option>
      <option value="reviewed">تمت مراجعتها</option>
     </select>
    </label>
    <label className="form-label">بحث
     <input type="search" value={query} onChange={e=>{setQuery(e.target.value);setVisible(20);}}
      placeholder="نوع أو مبلغ"/>
    </label>
   </div>
   {shown.length===0?<p className="txt-muted text-sm">لا توجد مصروفات في هذا التصنيف.</p>:
    <div className="space-y-2">
     {shown.slice(0,visible).map(e=>{
      const review=reviewedById.get(e.id);
      return <div key={e.id} className="rounded-xl border p-3 space-y-2"
       style={{borderColor:"var(--border)"}}>
       <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
         <strong className="block">{e.expense_type}</strong>
         <span className="txt-muted text-xs">
          {new Date(e.occurred_at).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{timeZone:"Asia/Riyadh"})}
         </span>
        </div>
        <strong className="shrink-0" dir="ltr">{formatCurrency(e.amount)}</strong>
       </div>
       <p className="text-xs txt-warning">{reasons(e).join(" · ")}</p>
       {e.notes&&<p className="txt-muted text-xs">{e.notes.slice(0,250)}</p>}
       <div className="flex items-center justify-between gap-2">
        <span className="text-xs txt-muted">{review?labels[review.review_state]:"لم يُراجع بعد"}</span>
        <button type="button" className="btn-secondary text-sm" onClick={()=>setEditing(e)}>مراجعة</button>
       </div>
      </div>;
     })}
     {shown.length>visible&&<button type="button" className="btn-secondary w-full"
      onClick={()=>setVisible(x=>x+20)}>عرض المزيد ({shown.length-visible})</button>}
    </div>}
  </>}
  {editing&&<Reviewer key={editing.id} expense={editing}
   review={reviewedById.get(editing.id)} onSaved={load} onClose={()=>setEditing(null)}/>}
 </section>;
}
