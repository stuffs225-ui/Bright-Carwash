"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type HistoricalMismatch={id:string;legacy_ref:string|null;occurred_at:string;legacy_reported_total:number|null;cash_paid:number;card_paid:number};
type Issue = {
  id: number;
  source_sheet:string;
  source_row:number;
  issue_code:string;
  details:Record<string,unknown>;
  status:"pending"|"resolved"|"waived";
  resolution_note:string|null;
  created_at:string;
};
const NAMES:Record<string,string> = {
  total_mismatch:"فرق بين الإجمالي المدخل والكاش/البطاقة",
  not_importable:"بيانات غير صالحة للترحيل التلقائي",
};

export function ReconciliationTab() {
  const [issues,setIssues]=useState<Issue[]>([]);
  const [mismatches,setMismatches]=useState<HistoricalMismatch[]>([]);
  const [notes,setNotes]=useState<Record<number,string>>({});
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const refresh=useCallback(async()=>{
    const [oldIssues,oldMismatches]=await Promise.all([
      supabase.from("legacy_import_issues")
       .select("id,source_sheet,source_row,issue_code,details,status,resolution_note,created_at")
       .order("source_sheet").order("source_row"),
      supabase.from("entries")
       .select("id,legacy_ref,occurred_at,legacy_reported_total,cash_paid,card_paid")
       .eq("legacy_amount_mismatch",true).is("deleted_at",null)
       .order("occurred_at",{ascending:false}).limit(1000)
    ]);
    if(oldIssues.error||oldMismatches.error){setError("تعذر تحميل فروقات الأرشيف؛ حاول مجددًا.");return;}
    setIssues((oldIssues.data||[]) as Issue[]);
    setMismatches((oldMismatches.data||[]) as HistoricalMismatch[]);
    setError("");
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const open=useMemo(()=>issues.filter(x=>x.status==="pending"),[issues]);
  async function decide(item:Issue,status:"resolved"|"waived") {
    const note=(notes[item.id]||"").trim();
    if(note.length<10){setError("وثّق سبب المعالجة أو التجاوز بما لا يقل عن 10 أحرف.");return;}
    setPending(true);setError("");setSuccess("");
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setError("سجّل دخول المدير مجددًا.");setPending(false);return;}
    const {error:updateError}=await supabase.from("legacy_import_issues").update({
      status,resolution_note:note,resolved_at:new Date().toISOString(),resolved_by:user.id,
    }).eq("id",item.id).eq("status","pending");
    if(updateError)setError(updateError.message);
    else{setSuccess("تم توثيق قرار المراجعة. لم يتم تغيير أي مبلغ أو عملية أصلية.");await refresh();}
    setPending(false);
  }

  return <div dir="rtl" className="space-y-5">
    <section className="card">
      <h2 className="section-title">مراجعة بيانات المغسلة القديمة</h2>
      <p className="txt-muted text-sm">هذه القائمة لا تُصحّح المبالغ تلقائيًا. يجب الرجوع إلى بيانات المصدر وتوثيق السبب قبل اعتماد الإقفال المالي.</p>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="card"><strong>قضايا بانتظار المراجعة</strong><p className="text-2xl font-bold">{open.length}</p></div>
        <div className="card"><strong>إجمالي القضايا</strong><p className="text-2xl font-bold">{issues.length}</p></div>
      </div>
    </section>
    <section className="card space-y-3">
      <h3 className="section-title">أرشيف الفروق الموثقة ({mismatches.length})</h3>
      <p className="txt-muted text-sm">فروقات قديمة من 2025 بين الإجمالي المكتوب ومبالغ التحصيل. جميع مبالغ الكاش والشبكة محفوظة كما وردت، والفروق لا تُعَدّ عمليات ضائعة. تُعرض التفاصيل للتدقيق عند الطلب.</p>
      {mismatches.length===0?<p className="txt-muted">لا توجد فروقات أرشيفية.</p>:<details className="rounded-xl border p-3"><summary className="cursor-pointer font-bold">عرض تفاصيل الفروقات التاريخية ({mismatches.length})</summary><div className="overflow-x-auto mt-3"><table className="app-table"><thead><tr><th>المرجع</th><th>التاريخ</th><th>المبلغ الأصلي</th><th>الكاش + الشبكة</th><th>الفرق</th></tr></thead><tbody>
       {mismatches.map(r=>{const paid=Number(r.cash_paid)+Number(r.card_paid);const origin=r.legacy_reported_total===null?null:Number(r.legacy_reported_total);return <tr key={r.id}><td data-label="المرجع">{r.legacy_ref||"—"}</td><td data-label="التاريخ">{new Date(r.occurred_at).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{timeZone:"Asia/Riyadh"})}</td><td data-label="المبلغ الأصلي">{origin===null?"غير مسجل":origin.toFixed(2)}</td><td data-label="الكاش + الشبكة">{paid.toFixed(2)}</td><td data-label="الفرق">{origin===null?"غير معروف":(origin-paid).toFixed(2)}</td></tr>})}
      </tbody></table></div></details>}
    </section>
    {error&&<p role="alert" className="txt-danger">{error}</p>}
    {success&&<p role="status">{success}</p>}
    <section className="card">
      <h3 className="section-title">التفاصيل</h3>
      <div className="space-y-4">
        {open.length===0&&<p className="txt-muted">لا توجد قضايا معلّقة، أو لم تُرحّل بيانات المصدر بعد.</p>}
        {open.map(item=><div key={item.id} className="rounded-lg border p-4 space-y-3">
          <strong>{item.source_sheet} — الصف {item.source_row}</strong>
          <p className="text-sm">{NAMES[item.issue_code]||item.issue_code}</p>
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap" dir="ltr">{JSON.stringify(item.details,null,2)}</pre>
          <label className="form-label">تفسير القرار / مستند التصحيح
            <textarea className="w-full" value={notes[item.id]||""}
              onChange={e=>setNotes(x=>({...x,[item.id]:e.target.value}))}
              placeholder="مثال: تمت مطابقة العملية مع تقرير جهاز الشبكة بتاريخ ..." />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn-primary" disabled={pending} onClick={()=>void decide(item,"resolved")}>توثيق المعالجة</button>
            <button type="button" className="btn-secondary" disabled={pending} onClick={()=>void decide(item,"waived")}>توثيق التجاوز</button>
          </div>
        </div>)}
      </div>
    </section>
  </div>;
}
