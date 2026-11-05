"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {fetchAllRows} from "@/lib/fetchAll";
import {formatCurrency} from "@/lib/business";
import {showToast} from "@/lib/toast";
import {MetricCard} from "./MetricCard";
import {Modal} from "./Modal";
import type {Entry} from "@/lib/types";

type Shift={id:string;opened_at:string;status:"open"|"awaiting_owner"|"approved";approved_at:string|null};
type Device={id:string;device_id:string;registered_at:string;last_seen_at:string;sealed_at:string|null};
type Settlement={
  id:string;shift_id:string;recorded_cash:number;recorded_card:number;
  actual_cash:number;terminal_card:number;cash_difference:number;card_difference:number;
  cars:number;crew_provision:number;report_object_path:string;
  difference_reason:string|null;manager_reviewed_at:string;
  variance_approved_at:string|null;
};

function money(n:number){return Math.round(n*100)/100;}
function sum(rows:Entry[],field:"cash_paid"|"card_paid"){return money(rows.reduce((a,b)=>a+Number(b[field]||0),0));}

export function ShiftCloseTab({isOwner}:{isOwner:boolean}){
  const [active,setActive]=useState<Shift|null>(null);
  const [devices,setDevices]=useState<Device[]>([]);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [settlement,setSettlement]=useState<Settlement|null>(null);
  const [history,setHistory]=useState<Shift[]>([]);
  const [historySelected,setHistorySelected]=useState<Shift|null>(null);
  const [historyEntries,setHistoryEntries]=useState<Entry[]>([]);
  const [historySettlement,setHistorySettlement]=useState<Settlement|null>(null);
  const [detailFilter,setDetailFilter]=useState<"all"|"cash"|"card"|"crew"|null>(null);
  const [editing,setEditing]=useState<Entry|null>(null);
  const [editCash,setEditCash]=useState("");
  const [editCard,setEditCard]=useState("");
  const [editDiscount,setEditDiscount]=useState("");
  const [editNotes,setEditNotes]=useState("");
  const [actualCash,setActualCash]=useState("");
  const [posTotal,setPosTotal]=useState("");
  const [statement,setStatement]=useState<File|null>(null);
  const [differenceReason,setDifferenceReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const reload=useCallback(async()=>{
    const {data:open,error:shiftError}=await supabase.from("carwash_shifts")
      .select("id,opened_at,status,approved_at")
      .in("status",["open","awaiting_owner"]).order("opened_at",{ascending:false})
      .limit(1).maybeSingle();
    const {data:past,error:pastError}=await supabase.from("carwash_shifts")
      .select("id,opened_at,status,approved_at")
      .eq("status","approved").order("approved_at",{ascending:false}).limit(30);
    if(shiftError||pastError){setError(shiftError?.message||pastError?.message||"خطأ اتصال");return;}
    setActive((open as Shift)||null);
    setHistory((past||[]) as Shift[]);
    if(!open){setEntries([]);setDevices([]);setSettlement(null);setError("");return;}
    try {
    const [cars,dev,review]=await Promise.all([
      fetchAllRows<Entry>((from,to)=>supabase.from("entries")
        .select("*").eq("shift_id",open.id).is("deleted_at",null)
        .order("occurred_at",{ascending:false}).range(from,to)),
      supabase.from("carwash_shift_devices")
        .select("id,device_id,registered_at,last_seen_at,sealed_at")
        .eq("shift_id",open.id).order("registered_at"),
      supabase.from("carwash_shift_settlements")
        .select("*").eq("shift_id",open.id).maybeSingle(),
    ]);
    if(dev.error||review.error){setError(dev.error?.message||review.error?.message||"تعذر فحص الأجهزة");return;}
    setEntries(cars);setDevices((dev.data||[]) as Device[]);
    setSettlement((review.data as Settlement)||null);setError("");
    } catch (cause) {
      setError("تعذر جلب جميع تسجيلات الوردية: "+(cause instanceof Error?cause.message:"خطأ اتصال"));
    }
  },[]);

  useEffect(()=>{
    void reload();
    const timer=setInterval(()=>{if(navigator.onLine)void reload();},15000);
    return()=>clearInterval(timer);
  },[reload]);

  const totals=useMemo(()=>({
    count:entries.length,cash:sum(entries,"cash_paid"),card:sum(entries,"card_paid"),
    crew:entries.length*10,discount:money(entries.reduce((a,e)=>a+Number(e.discount_amount||0),0))
  }),[entries]);
  const diffCash=actualCash.trim()?money(Number(actualCash)-totals.cash):null;
  const diffCard=posTotal.trim()?money(Number(posTotal)-totals.card):null;
  const anyDifference=diffCash!==null&&diffCard!==null&&(diffCash!==0||diffCard!==0);
  const unsyncedDevices=devices.filter(d=>!d.sealed_at);

  async function submit(){
    if(!active||active.status!=="open"){showToast("الوردية غير قابلة للاعتماد.","warning");return;}
    if(devices.length===0||unsyncedDevices.length>0){
      showToast("لا يمكن الاعتماد؛ جميع الأجهزة المسجلة يجب أن تكمل المزامنة.","warning");return;
    }
    if(!actualCash.trim()||!posTotal.trim()||!statement){
      showToast("أدخل النقد الفعلي ومجموع الشبكة وأرفق صورة تقرير الجهاز.","warning");return;
    }
    if(!Number.isFinite(Number(actualCash))||!Number.isFinite(Number(posTotal))||
       Number(actualCash)<0||Number(posTotal)<0){
      showToast("مبالغ الموازنة غير صحيحة.","warning");return;
    }
    if(anyDifference && differenceReason.trim().length<5){
      showToast("أي فرق في الموازنة يحتاج سببًا واضحًا لاعتماد المالك.","warning");return;
    }
    if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(statement.type)
      ||statement.size>10*1024*1024){
      showToast("أرفق صورة JPG/PNG/WebP أو PDF بحجم حتى 10MB.","warning");return;
    }
    if(!confirm("تأكيد مراجعة الموازنة؟ إذا تطابقت القيم سيُعتمد الإقفال وتبدأ وردية جديدة."))return;
    setBusy(true);setError("");
    const path=active.id+"/"+crypto.randomUUID()+
      (statement.type==="application/pdf"?".pdf":statement.type==="image/png"?".png":
       statement.type==="image/webp"?".webp":".jpg");
    const uploaded=await supabase.storage.from("carwash-pos-evidence")
      .upload(path,statement,{contentType:statement.type,upsert:false});
    if(uploaded.error){
      setBusy(false);setError("فشل حفظ إثبات الشبكة: "+uploaded.error.message);return;
    }
    const {data,error:closeError}=await supabase.rpc("submit_carwash_shift_settlement",{
      p_shift_id:active.id,p_actual_cash:Number(actualCash),
      p_terminal_card:Number(posTotal),p_report_path:path,
      p_reason:differenceReason.trim()||null,
    });
    setBusy(false);
    if(closeError){setError("فشل اعتماد الوردية: "+closeError.message);return;}
    setActualCash("");setPosTotal("");setStatement(null);setDifferenceReason("");
    showToast(data==="awaiting_owner"
      ?"الفرق محفوظ وينتظر اعتماد المالك؛ لم تُفتح وردية جديدة بعد."
      :"تم اعتماد الموازنة وفتح وردية جديدة تلقائيًا.");
    await reload();
  }

  async function approveDifference(){
    if(!active||!isOwner||active.status!=="awaiting_owner")return;
    if(!confirm("اعتماد فروقات الكاش والشبكة وفتح وردية جديدة؟"))return;
    setBusy(true);
    const {error}=await supabase.rpc("approve_carwash_shift_variance",{p_shift_id:active.id});
    setBusy(false);
    if(error){setError(error.message);return;}
    showToast("اعتمد المالك الفروق، وبدأت وردية جديدة.");await reload();
  }

  async function showHistory(shift:Shift){
    setHistorySelected(shift);setHistoryEntries([]);setHistorySettlement(null);
    try {
    const [rows,review]=await Promise.all([
      fetchAllRows<Entry>((from,to)=>supabase.from("entries")
        .select("*").eq("shift_id",shift.id).is("deleted_at",null)
        .order("occurred_at",{ascending:false}).range(from,to)),
      supabase.from("carwash_shift_settlements").select("*")
        .eq("shift_id",shift.id).maybeSingle(),
    ]);
    if(review.error)throw review.error;
    setHistoryEntries(rows);setHistorySettlement((review.data as Settlement)||null);
    } catch(cause){setError("تعذر استرجاع الوردية من الأرشيف: "+(cause instanceof Error?cause.message:"خطأ اتصال"));}
  }

  function beginEdit(entry:Entry){
    if(active?.status!=="open")return;
    setEditing(entry);setEditCash(String(entry.cash_paid));setEditCard(String(entry.card_paid));
    setEditDiscount(String(entry.discount_amount||0));setEditNotes(entry.notes||"");
  }
  async function saveCorrection(){
    if(!editing||active?.status!=="open")return;
    const cash=Number(editCash),card=Number(editCard),discount=Number(editDiscount);
    if(![cash,card,discount].every(Number.isFinite) || cash<0||card<0||discount<0||cash+card<=0){
      showToast("المبالغ الجديدة غير صحيحة.","warning");return;
    }
    setBusy(true);
    const {error}=await supabase.from("entries").update({
      cash_paid:cash,card_paid:card,discount_amount:discount,notes:editNotes
    }).eq("id",editing.id).eq("shift_id",active.id);
    setBusy(false);
    if(error){setError("التصحيح رُفض: "+error.message);return;}
    setEditing(null);showToast("حُفظ التصحيح مع سجل التعديل للمراجعة.");await reload();
  }

  const detailEntries=entries.filter(e=>detailFilter==="all"||detailFilter==="crew"||
     (detailFilter==="cash"&&Number(e.cash_paid)>0)||
     (detailFilter==="card"&&Number(e.card_paid)>0));
  return <div className="space-y-6" dir="rtl">
    <section className="card">
      <h2 className="section-title">موازنة الوردية واعتماد تسجيلات العمال</h2>
      <p className="txt-muted text-sm">تُحتسب تسجيلات الحساب المشترك، ثم يُدخل المدير الكاش الفعلي وإجمالي تقرير الشبكة ويرفق الإثبات قبل الاعتماد. لا تُحذف البيانات بعد الإقفال.</p>
      {error&&<p role="alert" className="txt-danger mt-3">{error}</p>}
      {!active?<p className="txt-warning mt-3">لا توجد وردية نشطة. راجع حالة ربط قاعدة البيانات.</p>:<>
        <p className="mt-3 font-semibold">الوردية بدأت: {new Date(active.opened_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})} · {active.status==="awaiting_owner"?"بانتظار اعتماد فرق من المالك":"مفتوحة"}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <MetricCard label="السيارات" value={totals.count} tone="blue" onClick={()=>setDetailFilter("all")} />
          <MetricCard label="كاش مسجل" value={formatCurrency(totals.cash)} tone="green" onClick={()=>setDetailFilter("cash")} />
          <MetricCard label="شبكة مسجلة" value={formatCurrency(totals.card)} tone="purple" onClick={()=>setDetailFilter("card")} />
          <MetricCard label="مجموع عشرات العمال" value={formatCurrency(totals.crew)} tone="emerald" onClick={()=>setDetailFilter("crew")} />
        </div>
        <div className="mt-3 text-sm txt-muted">الخصومات المسجلة: {formatCurrency(totals.discount)} · المستحق جماعي بمعدل 10 ريالات لكل سيارة.</div>
      </>}
    </section>
    {active&&<section className="card">
      <h3 className="section-title">حالة أجهزة العمال</h3>
      <p className="txt-muted text-sm">الأجهزة التي لم تؤكد اكتمال إرسال التسجيلات تمنع إقفال الوردية.</p>
      <div className="space-y-2 mt-3">{devices.length===0?
        <p className="txt-warning text-sm">لا توجد أجهزة مسجلة؛ الإقفال ممنوع.</p>:
        devices.map(d=><div key={d.id} className="flex justify-between gap-3 border-b py-2">
          <span className="text-sm">جهاز {d.device_id.slice(0,8)} · آخر اتصال {new Date(d.last_seen_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})}</span>
          <strong className={d.sealed_at?"txt-cash":"txt-warning"}>{d.sealed_at?"اكتمل":"بانتظار المزامنة"}</strong>
        </div>)}</div>
    </section>}
    {active?.status==="open"&&<section className="card space-y-4">
      <h3 className="section-title">مقارنة الموازنة الفعلية</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="form-label">الكاش الموجود فعليًا (ر.س)
          <input type="number" min="0" step="0.01" inputMode="decimal" value={actualCash} onChange={e=>setActualCash(e.target.value)} />
        </label>
        <label className="form-label">إجمالي تقرير جهاز الشبكة (ر.س)
          <input type="number" min="0" step="0.01" inputMode="decimal" value={posTotal} onChange={e=>setPosTotal(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <p className="font-semibold">فرق الكاش: {diffCash===null?"—":formatCurrency(diffCash)}</p>
        <p className="font-semibold">فرق الشبكة: {diffCard===null?"—":formatCurrency(diffCard)}</p>
      </div>
      <label className="form-label">صورة إثبات تقرير الشبكة (إلزامية)
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setStatement(e.target.files?.[0]||null)} />
      </label>
      {anyDifference&&<label className="form-label">سبب الفرق — سيراجعه ويعتمده المالك
        <textarea rows={3} value={differenceReason} onChange={e=>setDifferenceReason(e.target.value)} placeholder="سبب فرق الكاش أو الشبكة..." />
      </label>}
      <button type="button" className="btn-primary w-full" disabled={busy||devices.length===0||unsyncedDevices.length>0} onClick={()=>void submit()}>
        {busy?"جاري المعالجة":"مراجعة وإرسال اعتماد موازنة الوردية"}
      </button>
    </section>}
    {active?.status==="awaiting_owner"&&<section className="card space-y-3">
      <h3 className="section-title">الموازنة المعلقة لاعتماد المالك</h3>
      <p>فرق الكاش: {formatCurrency(settlement?.cash_difference||0)} · فرق الشبكة: {formatCurrency(settlement?.card_difference||0)}</p>
      <p className="txt-muted">السبب: {settlement?.difference_reason||"جارٍ تحميل السبب..."}</p>
      {isOwner?<button className="btn-primary w-full" type="button" disabled={busy||!settlement} onClick={()=>void approveDifference()}>اعتماد المالك وبدء وردية جديدة</button>:
       <p className="txt-warning">بانتظار المالك؛ لا تُفتح وردية جديدة قبل الاعتماد.</p>}
    </section>}
    <section className="card">
      <h3 className="section-title">التسجيلات الحالية — اضغط على أي مبلغ لرؤية تفاصيله</h3>
      <div className="space-y-2 mt-3">{entries.length===0?<p className="txt-muted">لا توجد تسجيلات في هذه الوردية.</p>:
        entries.map((e,i)=><div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-3">
          <span>#{i+1} · {e.car_type} · {e.service_type}</span>
          <button type="button" className="link-inline" onClick={()=>{setDetailFilter("all");beginEdit(e);}}>
            {formatCurrency(e.gross)} · تفاصيل/تصحيح
          </button>
        </div>)}</div>
    </section>
    <section className="card">
      <h3 className="section-title">سجل الورديات المعتمدة — قابل للفحص</h3>
      {history.length===0?<p className="txt-muted">لا توجد ورديات معتمدة بعد.</p>:
        <div className="space-y-2">{history.map(x=><button key={x.id} className="w-full text-start border-b py-3 link-inline" type="button" onClick={()=>void showHistory(x)}>
          {new Date(x.opened_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})} · معتمدة {x.approved_at?new Date(x.approved_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"}):""}
        </button>)}</div>}
    </section>
    {detailFilter&&<Modal title={detailFilter==="crew"?"تفاصيل عشرات فريق العمال":detailFilter==="cash"?"عمليات الكاش":detailFilter==="card"?"عمليات الشبكة":"تفاصيل السيارات"} onClose={()=>setDetailFilter(null)}>
      <div className="space-y-2">{detailEntries.length===0?<p>لا توجد عمليات.</p>:
        detailEntries.map((e,i)=><div key={e.id} className="border-b py-3">
          #{i+1} · {e.car_type} · {e.service_type}
          <p className="text-sm txt-muted">كاش {formatCurrency(e.cash_paid)} · شبكة {formatCurrency(e.card_paid)} · خصم {formatCurrency(e.discount_amount||0)} · مخصص العمال 10 ر.س</p>
          <button type="button" className="link-inline text-sm" onClick={()=>{setDetailFilter(null);beginEdit(e);}}>تفاصيل وتصحيح قبل الاعتماد</button>
        </div>)}</div>
    </Modal>}
    {editing&&<Modal title="تفاصيل وتصحيح تسجيل سيارة" onClose={()=>setEditing(null)}>
      <div className="space-y-3">
        <p>{editing.car_type} · {editing.service_type} · {new Date(editing.occurred_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})}</p>
        {active?.status!=="open"?<p className="txt-warning">تم إقفال الموازنة؛ لا يسمح بتعديل القيود.</p>:<>
        <label className="form-label">الكاش<input type="number" min="0" step="0.01" value={editCash} onChange={e=>setEditCash(e.target.value)} /></label>
        <label className="form-label">الشبكة<input type="number" min="0" step="0.01" value={editCard} onChange={e=>setEditCard(e.target.value)} /></label>
        <label className="form-label">الخصم<input type="number" min="0" step="0.01" value={editDiscount} onChange={e=>setEditDiscount(e.target.value)} /></label>
        <label className="form-label">الملاحظات<input type="text" value={editNotes} onChange={e=>setEditNotes(e.target.value)} /></label>
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={()=>void saveCorrection()}>حفظ تصحيح موثق</button>
        </>}
      </div>
    </Modal>}
    {historySelected&&<Modal title="أرشيف تفاصيل الوردية المعتمدة" onClose={()=>{setHistorySelected(null);setHistoryEntries([]);setHistorySettlement(null);}}>
      <p className="font-bold">بدأت: {new Date(historySelected.opened_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})}</p>
      <p className="txt-muted text-sm">كاش مسجل {formatCurrency(historySettlement?.recorded_cash||0)} · شبكة مسجلة {formatCurrency(historySettlement?.recorded_card||0)} · مخصص عمال {formatCurrency(historySettlement?.crew_provision||0)}</p>
      <p className="txt-muted text-sm">فرق الكاش {formatCurrency(historySettlement?.cash_difference||0)} · فرق الشبكة {formatCurrency(historySettlement?.card_difference||0)}</p>
      <div className="space-y-2 mt-3">{historyEntries.map(e=><div key={e.id} className="border-b py-2">{e.car_type} · {e.service_type} — {formatCurrency(e.gross)} (كاش {formatCurrency(e.cash_paid)} · شبكة {formatCurrency(e.card_paid)})</div>)}</div>
    </Modal>}
  </div>;
}
