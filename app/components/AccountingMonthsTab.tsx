"use client";

import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {showToast} from "@/lib/toast";
import {formatCurrency} from "@/lib/business";
import {riyadhDate} from "@/lib/expenseDates";

type Month = {
  id:string; period:string;status:"open"|"approved"|"reopened";version:number;
  approved_at:string|null;reopened_at:string|null;reopen_reason:string|null;
};
type ReportVersion={version:number;snapshot:Record<string,string|number>;approved_at:string};

function previousRiyadhMonth():string {
  const [year,month]=riyadhDate().slice(0,7).split("-").map(Number);
  const d=new Date(Date.UTC(year,month-2,1));
  return d.toISOString().slice(0,7);
}

export function AccountingMonthsTab(){
  const [period,setPeriod]=useState(previousRiyadhMonth);
  const [month,setMonth]=useState<Month|null>(null);
  const [versions,setVersions]=useState<ReportVersion[]>([]);
  const [reason,setReason]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  const refresh=useCallback(async()=>{
    const {data,error}=await supabase.from("accounting_months")
      .select("id,period,status,version,approved_at,reopened_at,reopen_reason")
      .eq("period",period).maybeSingle();
    if(error){setError(error.message);return;}
    const found=data as Month|null;
    setMonth(found);
    if(!found){setVersions([]);setError("");return;}
    const history=await supabase.from("accounting_month_report_versions")
      .select("version,snapshot,approved_at")
      .eq("month_id",found.id).order("version",{ascending:false});
    if(history.error){setError(history.error.message);return;}
    setVersions((history.data||[]) as ReportVersion[]);
    setError("");
  },[period]);

  useEffect(()=>{void refresh();},[refresh]);
  async function approve(){
    if(!confirm("تأكيد اعتماد تقرير الشهر؟ سيُحفظ إصدار جديد من الملخص التاريخي."))return;
    setLoading(true);
    const {error}=await supabase.rpc("approve_carwash_month",{p_period:period});
    setLoading(false);
    if(error){showToast("تعذر اعتماد الشهر: "+error.message,"error");return;}
    setReason("");
    showToast("تم اعتماد الشهر وحفظ نسخة مالية مستقلة من التقرير.");
    void refresh();
  }
  async function reopen(){
    if(reason.trim().length<10){showToast("اكتب سبب إعادة الفتح بوضوح (10 أحرف على الأقل).","warning");return;}
    if(!confirm("هل تريد إعادة فتح الشهر المعتمد لتسجيل تصحيح، ثم اعتماده مرة أخرى؟"))return;
    setLoading(true);
    const {error}=await supabase.rpc("reopen_carwash_month",{p_period:period,p_reason:reason.trim()});
    setLoading(false);
    if(error){showToast("تعذر فتح الشهر: "+error.message,"error");return;}
    showToast("أُعيد فتح الشهر. يجب إعادة اعتماده بعد انتهاء التعديلات.");
    void refresh();
  }
  return <div className="space-y-6">
    <section className="card space-y-4">
      <h2 className="section-title">اعتماد تقارير الشهور وإعادة فتحها</h2>
      <p className="txt-muted text-sm">المدير وحده يستطيع اعتماد شهر مكتمل، أو إعادة فتح شهر معتمد مع تسجيل السبب؛ وبعد تسجيل المصروفات القديمة يجب إعادة الاعتماد. يُحتفظ بكل إصدارات التقارير السابقة.</p>
      <label className="form-label">الشهر
        <input type="month" value={period} onChange={e=>setPeriod(e.target.value)} />
      </label>
      {error&&<p className="txt-danger">{error}</p>}
      <p className="font-bold">حالة الشهر: {month?.status==="approved"?"معتمد":month?.status==="reopened"?"أعيد فتحه":"غير معتمد"} — الإصدار {month?.version||0}</p>
      {month?.status==="approved"?<>
        <label className="form-label">سبب إعادة فتح الشهر
          <textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="سبب تسجيل مصروف لاحق أو تصحيح بيانات..." />
        </label>
        <button type="button" className="btn-primary w-full" disabled={loading} onClick={()=>void reopen()}>إعادة فتح شهر معتمد</button>
      </>:<button type="button" className="btn-primary w-full" disabled={loading||period>=riyadhDate().slice(0,7)} onClick={()=>void approve()}>اعتماد التقرير بعد المراجعة</button>}
      {month?.status==="reopened"&&<p className="txt-warning text-sm">الشهر مفتوح للتصحيحات ولم يعد تقريره نهائيًا. أعد الاعتماد بعد إنهاء جميع الإدخالات.</p>}
    </section>
    <section className="card">
      <h2 className="section-title">سجل إصدارات التقرير المعتمدة</h2>
      {versions.length===0?<p className="txt-muted">لا توجد إصدارات معتمدة بعد.</p>:
      <div className="space-y-3">{versions.map(x=><div key={x.version} className="border-b pb-3">
        <p className="font-bold">إصدار {x.version} — {new Date(x.approved_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})}</p>
        <p className="txt-muted text-sm">سيارات: {x.snapshot.cars??0} · كاش: {formatCurrency(Number(x.snapshot.cash)||0)} · شبكة: {formatCurrency(Number(x.snapshot.card)||0)} · خصومات: {formatCurrency(Number(x.snapshot.discount)||0)} · مخصص الفريق: {formatCurrency(Number(x.snapshot.crew_provision)||0)} · مكافآت إضافية: {formatCurrency(Number(x.snapshot.crew_extra_bonuses)||0)} · مصروفات: {formatCurrency(Number(x.snapshot.expenses)||0)}</p>
      </div>)}</div>}
    </section>
  </div>;
}
