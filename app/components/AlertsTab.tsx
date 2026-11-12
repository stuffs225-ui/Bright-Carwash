"use client";
import {useCallback,useEffect,useState} from "react";
import {formatCurrency} from "@/lib/business";
import {supabase} from "@/lib/supabaseClient";
type Alert={id:string;kind:string;label:string;href:string};
export function AlertsTab({isOwner,summary}:{isOwner:boolean;summary?:{date:string;cars:number;cash:number;card:number;revenue:number;expenses:number;crew:number}}){
 const [alerts,setAlerts]=useState<Alert[]|null>(null);
 const [todayStatus,setTodayStatus]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [truncated,setTruncated]=useState(false);
 const refresh=useCallback(async()=>{
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)throw Error("جلسة الإدارة غير متاحة");
   const r=await fetch("/api/manager-overview",{headers:{authorization:"Bearer "+session.access_token},cache:"no-store"});
   if(!r.ok)throw Error("تعذر تحديث التنبيهات؛ لا تعني هذه الحالة عدم وجود تنبيهات.");
   const body=await r.json();setAlerts(body.alerts);setTodayStatus(body.todayStatus);setTruncated(body.truncated);setError("");
  }catch(e){setError(e instanceof Error?e.message:"تعذر التحديث");}
 },[]);
 useEffect(()=>{
  if(!isOwner)return;
  void refresh();
  const timer=setInterval(()=>{if(!document.hidden)void refresh();},30000);
  window.addEventListener("focus",refresh);
  return()=>{clearInterval(timer);window.removeEventListener("focus",refresh);};
 },[isOwner,refresh]);
 return <section className="card space-y-3" dir="rtl">
  {summary&&<div className="space-y-3">
   <h2 className="section-title">ملخص المالك اليومي — {summary.date}</h2>
   <dl className="grid grid-cols-2 gap-3">
    {[["عدد السيارات",String(summary.cars)],["الإيرادات",formatCurrency(summary.revenue)],["الكاش المحصل",formatCurrency(summary.cash)],["الشبكة المحصلة",formatCurrency(summary.card)],["المصروفات المسجلة",formatCurrency(summary.expenses)],["مستحقات العمال المسجلة",formatCurrency(summary.crew)],[summary.revenue-summary.expenses<0?"خسارة مسجلة":"ربح مسجل",formatCurrency(Math.abs(summary.revenue-summary.expenses))],["حالة الموازنة",error?"تعذر التحديث":todayStatus||"جارٍ التحميل..."]].map(([label,value])=><div key={label}><dt className="text-sm txt-muted">{label}</dt><dd className="font-bold">{value}</dd></div>)}
   </dl>
   <p className="txt-muted text-xs">مستحقات العمال المسجلة داخلة ضمن المصروفات؛ لا تُخصم مرة ثانية. النتيجة لا تشمل التكاليف غير المسجلة.</p>
  </div>}
  <h2 className="section-title">تنبيهات المدير</h2>
  {error&&<p className="txt-danger" role="alert">{error}</p>}
  {alerts===null&&!error&&<p role="status">جارٍ تحميل التنبيهات...</p>}
  {alerts?.length===0&&!error&&<p className="txt-muted">لا توجد موازنات معلقة أو فروقات مسجلة غير معتمدة أو مواد دون الحد المحدد.</p>}
  {alerts?.map(a=><a key={a.id} className="btn-secondary block text-start" href={a.href}>{a.label}</a>)}
  {truncated&&<p className="txt-warning">القائمة محدودة؛ راجع الأرشيف للتفاصيل الأقدم.</p>}
  <button type="button" className="btn-secondary" onClick={()=>void refresh()}>تحديث التنبيهات</button>
 </section>;
}
