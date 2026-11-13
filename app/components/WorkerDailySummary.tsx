"use client";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {WorkerDayReport} from "./WorkerDayReport";
import {dayIsFinished} from "@/lib/carwashCalendarDay";
import {workerText,workerMessage,workerDate,workerDirection,workerMoney,type WorkerLocale} from "@/lib/workerI18n";

type OpenDay={date:string;status:"open"|"awaiting_owner";cars:number;cash:number;card:number;crew:number;undelivered:number;submitted?:boolean};
type Props={token?:string;manager?:boolean;locale?:WorkerLocale;refreshKey?:number;queued?:number};
const sar=(n:number)=>new Intl.NumberFormat("ar-SA-u-nu-latn",{maximumFractionDigits:2}).format(n)+" ر.س";
const dateLabel=(date:string,locale:WorkerLocale)=>workerDate(date,locale);
export function WorkerDailySummary({token,manager=false,locale="ar",refreshKey=0,queued=0}:Props){
 const tt=(key:Parameters<typeof workerText>[1],vars?:Record<string,string|number>)=>workerText(locale,key,vars);
 const money=(value:number)=>manager?sar(value):workerMoney(value);
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
 return <section className="card space-y-3" dir={workerDirection(locale)} lang={locale}>
  <div className="flex flex-wrap justify-between items-center gap-2">
   <h2 className="section-title mb-0">{tt("days.title")}</h2>
  </div>
  {error&&<p role="status" className="txt-warning text-sm">{workerMessage(locale,error,"error.summary")} — {tt("days.lastData")}</p>}
  {days.length===0&&!loading?<p className="txt-muted text-sm">{tt("days.none")}</p>:null}
  {days.some(d=>dayIsFinished(d.date)&&d.status==="open"&&!d.submitted)&&!manager&&<p className="txt-warning font-bold">{tt("days.reportNeeded")}</p>}
  {days.map(day=><details key={day.date} data-testid="worker-day" className="border rounded-xl p-3"
   style={{borderColor:"var(--border)",background:"var(--surface-2)"}}>
   <summary className="cursor-pointer font-bold flex items-center justify-between gap-2">
    <span>{dateLabel(day.date,locale)} — {day.status==="awaiting_owner"||day.submitted?tt("days.pending"):tt("days.unapproved")}</span>
    <span className="txt-muted text-xs">{tt("days.carUnit",{n:day.cars})}</span>
   </summary>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
    <div className="metric-card tone-blue"><span className="metric-label">{tt("days.cars")}</span>
     <strong className="metric-value">{day.cars}</strong></div>
    <div className="metric-card tone-green"><span className="metric-label">{tt("days.cash")}</span>
     <strong className="metric-value">{money(day.cash)}</strong></div>
    <div className="metric-card tone-purple"><span className="metric-label">{tt("days.pos")}</span>
     <strong className="metric-value">{money(day.card)}</strong></div>
    <div className="metric-card tone-amber"><span className="metric-label">{tt("days.crew")}</span>
     <strong className="metric-value">{money(day.crew)}</strong></div>
   </div>

   {(day.undelivered||0)>0&&<p className="txt-warning text-sm mt-2" role="status">{tt("days.pendingDelivery",{n:day.undelivered})}</p>}
   {!manager&&!!token&&dayIsFinished(day.date)&&day.status==="open"&&!day.submitted&&day.undelivered===0&&<WorkerDayReport date={day.date} token={token} manager={manager} locale={locale} queued={queued} onSent={()=>{setDays(old=>old.map(d=>d.date===day.date?{...d,submitted:true}:d));void refresh();}}/>}
   {day.submitted&&<p className="txt-cash font-bold mt-3">{tt("days.reportSent")}</p>}
  </details>)}

 </section>;
}
