"use client";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {WorkerDayReport} from "./WorkerDayReport";
import {dayIsFinished} from "@/lib/carwashCalendarDay";

type OpenDay={date:string;status:"open"|"awaiting_owner";cars:number;cash:number;card:number;crew:number;submitted?:boolean};
type Props={token?:string;manager?:boolean;refreshKey?:number;queued?:number};
const sar=(n:number)=>new Intl.NumberFormat("ar-SA-u-nu-latn",{maximumFractionDigits:2}).format(n)+" ر.س";
const dateLabel=(date:string)=>new Date(date+"T12:00:00+03:00")
 .toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{timeZone:"Asia/Riyadh",year:"numeric",month:"short",day:"numeric"});
export function WorkerDailySummary({token,manager=false,refreshKey=0,queued=0}:Props){
 const [days,setDays]=useState<OpenDay[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const refresh=useCallback(async()=>{
  try{
   const headers:Record<string,string>={"content-type":"application/json"};
   if(manager){
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw Error("جلسة المدير غير متاحة");
    headers.authorization="Bearer "+session.access_token;
   }
   const response=await fetch("/api/worker-links/summary",{
    method:"POST",headers,body:JSON.stringify(token?{token}:{}),
    cache:"no-store",credentials:"same-origin"
   });
   const json=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(json.error||"تعذر تحميل الملخص");
   setDays(json.days||[]);setError("");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحديث الملخص");}
  finally{setLoading(false);}
 },[token,manager]);
 useEffect(()=>{
  void refresh();
  const periodic=window.setInterval(()=>{if(!document.hidden&&navigator.onLine)void refresh();},20000);
  const focus=()=>{if(navigator.onLine)void refresh();};
  document.addEventListener("visibilitychange",focus);
  window.addEventListener("online",focus);
  return()=>{window.clearInterval(periodic);
   document.removeEventListener("visibilitychange",focus);
   window.removeEventListener("online",focus);};
 },[refresh,refreshKey]);
 const today=days[0];
 return <section className="card space-y-3" dir="rtl">
  <div className="flex flex-wrap justify-between items-center gap-2">
   <div><h2 className="section-title mb-1">ملخص السيارات والأيام غير المعتمدة</h2>
    <p className="txt-muted text-xs">يُحدَّث تلقائيًا. أي يوم يعتمده المدير يختفي من هذه القائمة.</p></div>
   <button type="button" onClick={()=>void refresh()} className="btn-secondary" disabled={loading}>{loading?"جارٍ التحديث":"تحديث"}</button>
  </div>
  {error&&<p role="status" className="txt-warning text-sm">{error} — تظهر آخر بيانات تم تحميلها.</p>}
  {days.length===0&&!loading?<p className="txt-muted text-sm">لا توجد أيام مفتوحة أو تسجيلات جديدة حاليًا.</p>:null}
  {!manager&&days.some(d=>dayIsFinished(d.date)&&d.status==="open"&&!d.submitted)&&<p className="txt-warning font-bold">مطلوب إرسال موازنة اليوم المنتهي والصورة قبل اعتماد المدير.</p>}
  {days.map((day,i)=><details key={day.date} open={i===0||(!manager&&dayIsFinished(day.date)&&!day.submitted)} className="border rounded-xl p-3"
   style={{borderColor:"var(--border)",background:"var(--surface-2)"}}>
   <summary className="cursor-pointer font-bold flex items-center justify-between gap-2">
    <span>{dateLabel(day.date)} {day.status==="awaiting_owner"||day.submitted?"— بانتظار اعتماد المدير":""}</span>
    <span className="txt-muted text-xs">{day.cars} سيارة</span>
   </summary>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
    <div className="metric-card tone-blue"><span className="metric-label">السيارات</span>
     <strong className="metric-value">{day.cars}</strong></div>
    <div className="metric-card tone-green"><span className="metric-label">الكاش</span>
     <strong className="metric-value">{sar(day.cash)}</strong></div>
    <div className="metric-card tone-purple"><span className="metric-label">الشبكة</span>
     <strong className="metric-value">{sar(day.card)}</strong></div>
    <div className="metric-card tone-amber"><span className="metric-label">مخصص الفريق</span>
     <strong className="metric-value">{sar(day.crew)}</strong></div>
   </div>
   <p className="txt-muted text-xs mt-2">10 ريالات للفريق كاملًا عن كل سيارة؛ ليست راتبًا أو دفعة فردية.</p>
   {!manager&&token&&dayIsFinished(day.date)&&day.status==="open"&&!day.submitted&&<WorkerDayReport date={day.date} token={token} queued={queued} onSent={()=>{setDays(old=>old.map(d=>d.date===day.date?{...d,submitted:true}:d));void refresh();}}/>}
   {!manager&&day.submitted&&<p className="txt-cash font-bold mt-3">تم إرسال الموازنة والصورة — بانتظار اعتماد المدير.</p>}
  </details>)}
  {today&&<p className="txt-muted text-xs">جميع الأرقام للسجلات المزامنة مع قاعدة البيانات فقط. التسجيلات المعلقة على الجهاز غير محسوبة حتى تُرسل.</p>}
 </section>;
}
