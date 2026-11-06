"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {fetchAllRows} from "@/lib/fetchAll";
import {formatCurrency} from "@/lib/business";
import {dayIsFinished,riyadhDayKey,calendarDayTotals} from "@/lib/carwashCalendarDay";
import {Modal} from "./Modal";
import {MetricCard} from "./MetricCard";
import type {Entry} from "@/lib/types";

type Day={business_date:string;status:"open"|"awaiting_owner"|"approved";approved_at:string|null;approved_by:string|null};
type Device={device_id:string;sealed_at:string|null;last_seen_at:string};
type Settlement={business_date:string;recorded_cash:number;recorded_card:number;
 actual_cash:number;terminal_card:number;cash_difference:number;card_difference:number;
 cars:number;collective_tens:number;report_object_path:string;difference_reason:string|null};
function toMoney(v:number){return Math.round(v*100)/100;}

export function DaySettlementTab({canApproveVariance}:{canApproveVariance:boolean}){
 const [now,setNow]=useState(new Date());
 const [days,setDays]=useState<Day[]>([]);
 const [selected,setSelected]=useState("");
 const [rows,setRows]=useState<Entry[]>([]);
 const [devices,setDevices]=useState<Device[]>([]);
 const [settlement,setSettlement]=useState<Settlement|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [detail,setDetail]=useState<Entry|null>(null);
 const [filter,setFilter]=useState<"all"|"cash"|"card"|"crew"|null>(null);
 const [cashActual,setCashActual]=useState("");
 const [posActual,setPosActual]=useState("");
 const [posStatement,setPosStatement]=useState<File|null>(null);
 const [reason,setReason]=useState("");
 const [editing,setEditing]=useState<Entry|null>(null);
 const [editCash,setEditCash]=useState("");
 const [editCard,setEditCard]=useState("");
 const [editNotes,setEditNotes]=useState("");
 const current=days.find(d=>d.business_date===selected);
 const totals=useMemo(()=>calendarDayTotals(rows),[rows]);
 const cashDiff=cashActual.trim()?toMoney(Number(cashActual)-totals.cash):null;
 const cardDiff=posActual.trim()?toMoney(Number(posActual)-totals.card):null;
 const hasVariance=cashDiff!==null&&cardDiff!==null&&(cashDiff!==0||cardDiff!==0);
 const filtered=rows.filter(e=>filter==="all"||filter==="crew"||
  (filter==="cash"&&Number(e.cash_paid)>0)||(filter==="card"&&Number(e.card_paid)>0));
 const incomplete=devices.filter(d=>!d.sealed_at);

 const reloadDays=useCallback(async()=>{
  if(!navigator.onLine)return;
  const {data,error}=await supabase.from("carwash_days")
   .select("business_date,status,approved_at,approved_by")
   .order("business_date",{ascending:false}).limit(90);
  if(error){setError("تعذر قراءة الأيام: "+error.message);return;}
  const list=(data||[]) as Day[];
  setDays(list);
  setSelected(old=>{
   if(old&&list.some(d=>d.business_date===old))return old;
   return list.find(d=>d.status!=="approved")?.business_date||list[0]?.business_date||"";
  });
 },[]);

 const reloadDay=useCallback(async()=>{
  if(!selected||!navigator.onLine)return;
  try{
   const [loaded,deviceList,proof]=await Promise.all([
    fetchAllRows<Entry>((from,to)=>supabase.from("entries").select("*")
     .eq("business_date",selected).is("deleted_at",null)
     .order("occurred_at",{ascending:false}).range(from,to)),
    supabase.from("carwash_day_devices").select("device_id,sealed_at,last_seen_at")
     .eq("business_date",selected),
    supabase.from("carwash_day_settlements").select("*")
     .eq("business_date",selected).maybeSingle(),
   ]);
   if(deviceList.error||proof.error)throw deviceList.error||proof.error;
   setRows(loaded);setDevices((deviceList.data||[]) as Device[]);
   setSettlement((proof.data as Settlement)||null);setError("");
  }catch(e){setError("تعذر استكمال معلومات اليوم: "+(e instanceof Error?e.message:"خطأ اتصال"));}
 },[selected]);

 useEffect(()=>{
  void reloadDays();
  const timer=setInterval(()=>{setNow(new Date());if(navigator.onLine)void reloadDays();},20000);
  return()=>clearInterval(timer);
 },[reloadDays]);
 useEffect(()=>{void reloadDay();const timer=setInterval(()=>void reloadDay(),12000);return()=>clearInterval(timer)},[reloadDay]);

 async function closeDay(){
  if(!current||current.status!=="open"||!dayIsFinished(selected,now))return;
  if(incomplete.length){setError("يوجد أجهزة لم تؤكد نهاية مزامنة هذا اليوم.");return;}
  if(cashActual.trim()===""||posActual.trim()===""||
   !Number.isFinite(Number(cashActual))||!Number.isFinite(Number(posActual))||
   Number(cashActual)<0||Number(posActual)<0){
   setError("أدخل الكاش الفعلي والإجمالي الصحيح لتقرير الشبكة.");return;
  }
  if(!posStatement){setError("ارفق صورة أو PDF لتقرير جهاز الشبكة.");return;}
  if(hasVariance&&reason.trim().length<5){setError("اكتب سبب الفروقات؛ سيراجعه المدير.");return;}
  if(posStatement.size>10*1024*1024||
     !["image/jpeg","image/png","image/webp","application/pdf"].includes(posStatement.type)){
   setError("مرفق POS يجب أن يكون JPG/PNG/WebP/PDF وبحجم أقل من 10MB.");return;
  }
  if(!confirm("اعتماد موازنة "+selected+" فقط؟ لن تُحذف أو تُعدّل تسجيلات اليوم التالي."))return;
  setBusy(true);setError("");
  const suffix=posStatement.type==="application/pdf"?".pdf":posStatement.type==="image/png"?".png":
   posStatement.type==="image/webp"?".webp":".jpg";
  const path="day/"+selected+"/"+crypto.randomUUID()+suffix;
  const upload=await supabase.storage.from("carwash-pos-evidence").upload(path,posStatement,{
   contentType:posStatement.type,upsert:false,
  });
  if(upload.error){setBusy(false);setError("فشل رفع صورة الشبكة: "+upload.error.message);return;}
  const {data,error}=await supabase.rpc("submit_carwash_day_settlement",{
   p_date:selected,p_actual_cash:Number(cashActual),p_terminal_card:Number(posActual),
   p_report_path:path,p_reason:reason.trim()||null,
  });
  setBusy(false);
  if(error){setError("فشل الاعتماد: "+error.message);return;}
  setCashActual("");setPosActual("");setPosStatement(null);setReason("");
  alert(data==="approved"
   ?"تم اعتماد يوم "+selected+"؛ اختفت تسجيلاته من حساب العمال وبقي الأرشيف محفوظًا.":"فرق الموازنة محفوظ ويحتاج موافقة المدير؛ اليوم لا يزال ظاهرًا للعامل.");
  await reloadDays();await reloadDay();
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
       onClick={()=>{setSelected(d.business_date);setCashActual("");setPosActual("");setReason("");setError("");setDetail(null);}}>
       {d.business_date} · {d.status==="approved"?"✓ معتمد":d.status==="awaiting_owner"?"بانتظار المدير":"غير معتمد"}
      </button>)}
    </div>}
  </section>
  {current&&<>
   <section className="card">
    <h3 className="section-title">حسابات {selected}</h3>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
     <MetricCard tone="blue" label="السيارات" value={totals.cars} onClick={()=>setFilter("all")} />
     <MetricCard tone="green" label="كاش" value={formatCurrency(totals.cash)} onClick={()=>setFilter("cash")} />
     <MetricCard tone="purple" label="شبكة" value={formatCurrency(totals.card)} onClick={()=>setFilter("card")} />
     <MetricCard tone="emerald" label="عشرات الفريق" value={formatCurrency(totals.collectiveTens)} onClick={()=>setFilter("crew")} />
    </div>
    <div className="mt-3 space-y-2">{rows.map(e=>
     <button type="button" key={e.id} className="w-full flex justify-between text-start items-center border-b py-3 link-inline" onClick={()=>setDetail(e)}>
      <span>{e.car_type} · {e.service_type}</span><strong>{formatCurrency(e.cash_paid+e.card_paid)}</strong>
     </button>)}</div>
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
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="form-label">الكاش الموجود فعليًا<input type="number" inputMode="decimal" min="0" step=".01" value={cashActual} onChange={e=>setCashActual(e.target.value)} /></label>
      <label className="form-label">إجمالي تقرير جهاز الشبكة<input type="number" inputMode="decimal" min="0" step=".01" value={posActual} onChange={e=>setPosActual(e.target.value)} /></label>
     </div>
     <p>فرق الكاش: {cashDiff===null?"—":formatCurrency(cashDiff)} · فرق الشبكة: {cardDiff===null?"—":formatCurrency(cardDiff)}</p>
     <label className="form-label">صورة / PDF تقرير الشبكة<input type="file" accept="image/*,application/pdf" onChange={e=>setPosStatement(e.target.files?.[0]||null)} /></label>
     {hasVariance&&<label className="form-label">سبب الفرق<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} /></label>}
     <button type="button" className="btn-primary w-full" disabled={busy||incomplete.length>0} onClick={()=>void closeDay()}>
      {busy?"جارٍ الاعتماد":"اعتماد هذا اليوم فقط"}
     </button>
    </section>:<section className="card"><p className="txt-muted">يوم {selected} لم ينتهِ بعد. يمكن مراجعته ولكن لا يعتمد قبل 12 صباحًا بتوقيت الرياض.</p></section>):
    <section className="card space-y-3">
     <h3 className="section-title">{current.status==="approved"?"أرشيف اليوم المعتمد":"فرق مالي ينتظر اعتماد المدير"}</h3>
     {settlement?<><p>الكاش المسجل: {formatCurrency(settlement.recorded_cash)} · الكاش الفعلي: {formatCurrency(settlement.actual_cash)}</p>
      <p>الشبكة المسجلة: {formatCurrency(settlement.recorded_card)} · تقرير الشبكة: {formatCurrency(settlement.terminal_card)}</p>
      <p>فرق الكاش: {formatCurrency(settlement.cash_difference)} · فرق الشبكة: {formatCurrency(settlement.card_difference)}</p>
      {settlement.difference_reason&&<p>سبب الفرق: {settlement.difference_reason}</p>}
      <p className="txt-muted text-sm">الأصل المالي محفوظ وغير قابل للتعديل بعد الاعتماد. مرفق الجهاز خاص بالمدير والمدير.</p></>:null}
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
   <p>الوقت بتوقيت الرياض: {new Date(detail.occurred_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})}</p>
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
