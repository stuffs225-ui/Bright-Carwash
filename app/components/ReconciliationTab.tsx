"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  const [notes,setNotes]=useState<Record<number,string>>({});
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const refresh=useCallback(async()=>{
    const {data,error:loadError}=await supabase.from("legacy_import_issues")
      .select("id,source_sheet,source_row,issue_code,details,status,resolution_note,created_at")
      .order("source_sheet").order("source_row");
    if(loadError){setError(loadError.message);return;}
    setIssues((data||[]) as Issue[]);
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
