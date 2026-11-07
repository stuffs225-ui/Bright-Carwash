"use client";
import {useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {fetchAllRows} from "@/lib/fetchAll";
import {riyadhDayKey} from "@/lib/carwashCalendarDay";
import {arabicDate} from "./ArabicDateField";
import {canonicalExpenseType} from "@/lib/expenseCategories";
import {displaySar,operatingResult,OPERATING_RESULT_NOTE} from "@/lib/financialPresentation";
import type {Entry,Expense} from "@/lib/types";
type Day={business_date:string;status:string};
type Settlement={business_date:string;cash_difference:number;card_difference:number;expected_cash:number|null};
type Bonus={shift_date:string;amount:number};
type Row={date:string;cars:Entry[];expenses:Expense[];dayStatus:string|null;settlement:Settlement|null};
const label=(n:number)=>displaySar(n);
export function MonthlyReview({period}:{period:string}){
 const [entries,setEntries]=useState<Entry[]>([]);
 const [expenses,setExpenses]=useState<Expense[]>([]);
 const [days,setDays]=useState<Day[]>([]);
 const [settlements,setSettlements]=useState<Settlement[]>([]);
 const [bonuses,setBonuses]=useState<Bonus[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [showEntries,setShowEntries]=useState(false);
 const boundaries=useMemo(()=>{
  const [year,month]=period.split("-").map(Number);
  const next=new Date(Date.UTC(year,month,1)).toISOString().slice(0,7);
  return {start:new Date(period+"-01T00:00:00+03:00").toISOString(),
   end:new Date(next+"-01T00:00:00+03:00").toISOString(),
   nextMonth:next,numberOfDays:new Date(Date.UTC(year,month,0)).getUTCDate()};
 },[period]);
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError("");
  async function load(){
   try{
    const [cars,spent,allDays,settled,extra]=await Promise.all([
     fetchAllRows<Entry>((from,to)=>supabase.from("entries").select("*")
      .is("deleted_at",null)
      .gte("occurred_at",boundaries.start).lt("occurred_at",boundaries.end)
      .order("occurred_at",{ascending:true}).range(from,to)),
     fetchAllRows<Expense>((from,to)=>supabase.from("expenses").select("*")
      .is("deleted_at",null)
      .gte("occurred_at",boundaries.start).lt("occurred_at",boundaries.end)
      .order("occurred_at",{ascending:true}).range(from,to)),
     supabase.from("carwash_days").select("business_date,status")
      .gte("business_date",period+"-01").lt("business_date",boundaries.nextMonth+"-01"),
     supabase.from("carwash_day_settlements")
      .select("business_date,cash_difference,card_difference,expected_cash")
      .gte("business_date",period+"-01").lt("business_date",boundaries.nextMonth+"-01"),
     supabase.from("crew_shift_bonuses").select("shift_date,amount")
      .is("deleted_at",null)
      .gte("shift_date",period+"-01").lt("shift_date",boundaries.nextMonth+"-01")
    ]);
    if(allDays.error||settled.error||extra.error)
     throw Error(allDays.error?.message||settled.error?.message||extra.error?.message||"تعذر التقرير");
    if(!cancelled){
     setEntries(cars);setExpenses(spent);setDays(allDays.data||[]);
     setSettlements((settled.data||[]) as Settlement[]);
     setBonuses((extra.data||[]) as Bonus[]);
    }
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"تعذر جلب البيانات");}
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[period,boundaries]);
 const rows=useMemo(()=>{
  const map=new Map<string,Row>();
  function row(day:string){
   const prior=map.get(day);
   if(prior)return prior;
   const r:Row={date:day,cars:[],expenses:[],dayStatus:null,settlement:null};
   map.set(day,r);return r;
  }
  for(const e of entries)row(riyadhDayKey(new Date(e.occurred_at))).cars.push(e);
  for(const e of expenses)row(riyadhDayKey(new Date(e.occurred_at))).expenses.push(e);
  for(const d of days)row(d.business_date).dayStatus=d.status;
  for(const d of settlements)row(d.business_date).settlement=d;
  return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
 },[entries,expenses,days,settlements]);
 const metrics=useMemo(()=>{
  const cash=entries.reduce((s,e)=>s+Number(e.cash_paid),0);
  const card=entries.reduce((s,e)=>s+Number(e.card_paid),0);
  const spent=expenses.reduce((s,e)=>s+Number(e.amount),0);
  const wages=expenses.filter(e=>e.expense_type==="راتب").reduce((s,e)=>s+Number(e.amount),0);
  const bonus=bonuses.reduce((s,e)=>s+Number(e.amount),0);
  const posVariance=settlements.reduce((s,e)=>s+Number(e.card_difference),0);
  const cashVariance=settlements.reduce((s,e)=>s+Number(e.cash_difference),0);
  const imported=entries.filter(e=>!e.business_date).length;
  const missingOperational=rows.filter(r=>r.cars.some(c=>!!c.business_date)&&r.dayStatus!=="approved").length;
  const approvals=days.filter(d=>d.status==="approved").length;
  const result=operatingResult(cash+card,spent);
  return {cash,card,spent,wages,bonus,posVariance,cashVariance,imported,missingOperational,
   approvals,openDays:days.length-approvals,result,crewProvision:entries.length*10};
 },[entries,expenses,bonuses,days,settlements,rows]);
 return <section className="card space-y-4">
  <h2 className="section-title">مراجعة شهر {period}</h2>
  {loading?<p className="txt-muted">جارٍ تحميل جميع قيود الشهر...</p>:error?
   <p className="txt-danger" role="alert">{error}</p>:<>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {([
     ["أيام الشهر",boundaries.numberOfDays],
     ["الأيام المعتمدة",metrics.approvals],
     ["أيام غير معتمدة",metrics.openDays],
     ["عدد السيارات",entries.length],
     ["الإيرادات",label(metrics.cash+metrics.card)],
     ["تحصيل كاش",label(metrics.cash)],
     ["تحصيل شبكة",label(metrics.card)],
     ["المصروفات المقيدة",label(metrics.spent)],
     ["رواتب مقيدة",label(metrics.wages)],
     ["مخصص فريق غير موزع",label(metrics.crewProvision)],
     ["مكافآت فريق",label(metrics.bonus)],
     ["نتيجة مالية مسجلة",metrics.result.label+" "+label(metrics.result.amount)],
     ["فرق الصندوق",label(metrics.cashVariance)],
     ["فرق الشبكة",label(metrics.posVariance)]
    ] as [string,string|number][]).map(([name,value])=>
     <div key={name} className="metric-card tone-slate">
      <span className="metric-label">{name}</span><strong className="metric-value">{value}</strong>
     </div>)}
   </div>
   <p className="txt-muted text-xs">{OPERATING_RESULT_NOTE} مخصص الفريق يُعرض منفصلًا ولا يُخصم ثانية إذا سبق إثباته ضمن الرواتب.</p>
   {metrics.missingOperational>0&&<p className="txt-warning text-sm">
    يوجد {metrics.missingOperational} يوم تشغيلي به سيارات غير معتمد، ويجب مراجعته قبل اعتماد الشهر.</p>}
   {metrics.imported>0&&<p className="txt-muted text-sm">
    يحتوي الشهر على {metrics.imported} سيارة مستوردة بتوقيت تاريخي دون business_date؛ تم احتسابها من occurred_at بتوقيت الرياض دون تعديل أصل السجل.</p>}
   <div className="border-t pt-3">
    <h3 className="subsection-title">الأيام والعمليات الأصلية</h3>
    {rows.length===0?<p className="txt-muted">لا توجد قيود لهذا الشهر.</p>:
     <div className="space-y-2">{rows.map(day=>{
      const dayRevenue=day.cars.reduce((s,e)=>s+Number(e.cash_paid)+Number(e.card_paid),0);
      const daySpend=day.expenses.reduce((s,e)=>s+Number(e.amount),0);
      return <details key={day.date} className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
       <summary className="cursor-pointer font-bold flex flex-wrap justify-between gap-2">
        <span>{arabicDate(day.date)} · {day.dayStatus==="approved"?"معتمد":day.dayStatus||"أرشيف/غير مقفل"}</span>
        <span>{day.cars.length} سيارة · إيراد {label(dayRevenue)} · مصروف {label(daySpend)}</span>
       </summary>
       <div className="mt-3 space-y-3">
        <details className="rounded-lg p-2" style={{background:"var(--surface-2)"}}>
         <summary className="font-bold cursor-pointer">عمليات السيارات ({day.cars.length})</summary>
         {day.cars.map(e=><details key={e.id} className="border-b py-2">
          <summary className="cursor-pointer flex justify-between gap-2">
           <span>{e.car_type} — {e.service_type}</span>
           <strong>{label(Number(e.cash_paid)+Number(e.card_paid))}</strong>
          </summary>
          <p className="txt-muted text-xs mt-2">
           الوقت: {new Date(e.occurred_at).toLocaleString("ar-SA-u-ca-gregory-nu-latn",{timeZone:"Asia/Riyadh"})}
            · كاش: {label(Number(e.cash_paid))} · شبكة: {label(Number(e.card_paid))}
            · خصم: {label(Number(e.discount_amount||0))}
          </p>
          <p className="txt-muted text-xs">مرجع العملية: {e.id} {e.notes?" — "+e.notes:""}</p>
         </details>)}
        </details>
        <details className="rounded-lg p-2" style={{background:"var(--surface-2)"}}>
         <summary className="font-bold cursor-pointer">المصروفات ({day.expenses.length})</summary>
         {day.expenses.map(e=><p key={e.id} className="border-b py-2 text-sm">
          {canonicalExpenseType(e.expense_type,e.notes)} · {e.notes||"—"} —
          <strong> {label(Number(e.amount))}</strong>
         </p>)}
        </details>
        {day.settlement&&<p className="txt-muted text-sm">فرق الكاش: {label(Number(day.settlement.cash_difference))} · فرق الشبكة: {label(Number(day.settlement.card_difference))}</p>}
       </div>
      </details>;
     })}</div>}
   </div>
  </>}
 </section>;
}
