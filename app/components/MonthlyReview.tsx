"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {fetchAllRows} from "@/lib/fetchAll";
import {riyadhDayKey,crewBonusEligible} from "@/lib/carwashCalendarDay";
import {arabicDate} from "./ArabicDateField";
import {canonicalExpenseType} from "@/lib/expenseCategories";
import {displaySar,operatingResult,OPERATING_RESULT_NOTE} from "@/lib/financialPresentation";
import type {Entry,Expense} from "@/lib/types";

type Day={business_date:string;status:string};
type Settlement={business_date:string;id:string;recorded_cash:number;recorded_card:number;
 actual_cash:number;terminal_card:number;cash_difference:number;card_difference:number;
 expected_cash:number|null;cash_expenses:number|null;cash_worker_payments:number|null;
 difference_reason:string|null;report_object_path:string};
type Bonus={id:string;shift_date:string;amount:number;reason:string|null;created_at:string};
type Ledger={id:string;worker_id:string;kind:"earning"|"payment";amount:number;
 notes:string|null;payment_source:string|null;occurred_at:string;expense_id:string|null};
type Row={date:string;cars:Entry[];expenses:Expense[];bonuses:Bonus[];
 ledger:Ledger[];dayStatus:string|null;settlement:Settlement|null};
type Origin={kind:"car"|"expense"|"bonus"|"ledger"|"settlement";id:string;amount:number;
 label:string;source:Entry|Expense|Bonus|Ledger|Settlement};
type MetricKey="cars"|"revenue"|"cash"|"card"|"expenses"|"salary"|"bonuses"|
 "discounts"|"provision"|"cash_diff"|"card_diff"|"result"|"wages_due"|"wages_paid";
const money=(n:number)=>(n<0?"−":"")+displaySar(Math.abs(n));
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const carCash=(e:Entry)=>Number(e.cash_paid)||0;
const carCard=(e:Entry)=>Number(e.card_paid)||0;
const cardTotal=(e:Entry)=>round(carCash(e)+carCard(e));
const expenseAmount=(e:Expense)=>Number(e.amount)||0;
const entryDate=(e:Entry)=>riyadhDayKey(new Date(e.occurred_at));
const time=(v:string)=>new Date(v).toLocaleString("ar-SA-u-ca-gregory-nu-latn",
 {timeZone:"Asia/Riyadh",year:"numeric",month:"short",day:"numeric",
 hour:"2-digit",minute:"2-digit"});
const metricInfo:Record<MetricKey,{label:string;explain:string}>={
 cars:{label:"عدد السيارات",explain:"جميع السيارات التي لها عمليات أصلية في الفترة"},
 revenue:{label:"إيرادات الغسيل",explain:"إجمالي الكاش والشبكة المسجلين، ولا يشمل النقدية في الصندوق"},
 cash:{label:"الكاش المحصل",explain:"الجزء المسجل كاش في عمليات السيارات فقط"},
 card:{label:"الشبكة المحصلة",explain:"الجزء المسجل شبكة في عمليات السيارات، لا كشف البنك"},
 expenses:{label:"المصروفات المقيدة",explain:"جميع المصروفات المثبتة، بما فيها رواتب الاستحقاق الموثقة، دون إعادة احتساب الدفعات"},
 salary:{label:"الرواتب المقيدة",explain:"قيود المصروفات المصنفة رواتب، وليست الدفعات النقدية"},
 bonuses:{label:"مكافآت الفريق المسجلة",explain:"سجل المكافآت الجماعية؛ اعتماده أو دفعه لا يُستنتج من وجود السجل وحده"},
 discounts:{label:"الخصومات",explain:"مبالغ الخصم المسجلة لكل سيارة، لا تعد مصروفًا جديدًا"},
 provision:{label:"مخصص الفريق النظري",explain:"10 ريالات للفريق كاملًا لكل سيارة صغيرة أو كبيرة مؤهلة؛ ليس دفعة فعلية"},
 cash_diff:{label:"فرق الكاش",explain:"فرق الصندوق من الموازنات المسجلة؛ ليس خسارة تشغيلية تلقائيًا"},
 card_diff:{label:"فرق الشبكة",explain:"الفروق الموثقة بين الجهاز والعمليات المسجلة"},
 result:{label:"النتيجة المالية المقيدة",explain:"إيرادات السيارات − المصروفات المقيدة فقط؛ لا تشمل الالتزامات غير المثبتة"},
 wages_due:{label:"مستحقات العاملين في الدفتر",explain:"سجلات الاستحقاق في دفتر العمال؛ قد يكون مصروفها مثبتًا فلا يخصم ثانية"},
 wages_paid:{label:"دفعات العاملين",explain:"حركات الدفع من دفتر العامل؛ حركة نقدية وليست مصروفًا إضافيًا"},
};
function originsFor(row:Row,metric:MetricKey):Origin[]{
 const cars=row.cars.filter(e=>metric==="provision"?crewBonusEligible(e.car_type):
  metric==="cash"?carCash(e)>0:metric==="card"?carCard(e)>0:
  metric==="discounts"?Number(e.discount_amount)>0:true);
 const income=(key:MetricKey)=>cars.map(e=>({
  kind:"car" as const,id:e.id,
  amount:key==="cash"?carCash(e):key==="card"?carCard(e):
   key==="discounts"?Number(e.discount_amount):
   key==="provision"?10:key==="cars"?1:cardTotal(e),
  label:e.car_type+" — "+e.service_type,source:e
 }));
 const expenses=(row.expenses.filter(e=>metric!=="salary"||canonicalExpenseType(e.expense_type,e.notes)==="رواتب"))
  .map(e=>({kind:"expense" as const,id:e.id,amount:expenseAmount(e),
   label:canonicalExpenseType(e.expense_type,e.notes),source:e}));
 const bonus=row.bonuses.map(e=>({kind:"bonus" as const,id:e.id,
  amount:Number(e.amount),label:"مكافأة جماعية",source:e}));
 const ledger=row.ledger.filter(e=>metric==="wages_due"?e.kind==="earning":e.kind==="payment")
  .map(e=>({kind:"ledger" as const,id:e.id,amount:Number(e.amount),
   label:e.kind==="payment"?"دفعة للعامل":"مستحق للعامل",source:e}));
 const settlement=row.settlement?[{kind:"settlement" as const,id:row.settlement.id,
  amount:Number(metric==="cash_diff"?row.settlement.cash_difference:row.settlement.card_difference),
  label:"موازنة "+row.date,source:row.settlement}]:[];
 switch(metric){
  case "cars":case "revenue":case "cash":case "card":
  case "discounts":case "provision":return income(metric);
  case "expenses":case "salary":return expenses;
  case "bonuses":return bonus;
  case "wages_due":case "wages_paid":return ledger;
  case "cash_diff":case "card_diff":return settlement;
  case "result":return [...income("revenue"),...expenses.map(e=>({...e,amount:-e.amount}))];
 }
}
function sumOrigins(items:Origin[],key:MetricKey):number{
 return key==="cars"?items.length:round(items.reduce((n,e)=>n+e.amount,0));
}
function originDetail(origin:Origin):Array<[string,string]>{
 const x=origin.source as unknown as Record<string,unknown>;
 const str=(field:string)=>x[field]===null||x[field]===undefined?"—":String(x[field]);
 if(origin.kind==="car")return [
  ["نوع السيارة",str("car_type")],["الخدمة",str("service_type")],
  ["وقت العملية",time(str("occurred_at"))],["الكاش",money(Number(x.cash_paid||0))],
  ["الشبكة",money(Number(x.card_paid||0))],
  ["الخصم",money(Number(x.discount_amount||0))],
  ["الإضافات الرسمية",money(Number(x.addon_total||0))],
  ["السعر الأساسي الاستثنائي",x.one_time_base_price==null?"غير مستخدم":money(Number(x.one_time_base_price))],
  ["الخدمة الاستثنائية",str("one_time_service_name")],
  ["الإضافات لمرة واحدة",x.one_time_addons?JSON.stringify(x.one_time_addons):"—"],
  ["سبب اختلاف السعر",str("one_time_reason")],["العامل",str("worker_name")],
  ["الملاحظات",str("notes")],["المرجع",origin.id]
 ];
 if(origin.kind==="expense")return [
  ["نوع المصروف الأصلي",str("expense_type")],["التصنيف التحليلي",canonicalExpenseType(str("expense_type"),str("notes"))],
  ["التاريخ",time(str("occurred_at"))],["المبلغ",money(Number(x.amount))],
  ["مصدر الدفع",str("payment_source")],["نوع الاعتراف",str("recognition_kind")],
  ["مرجع دفتر العامل",str("source_ledger_id")],["الملاحظات",str("notes")],["المرجع",origin.id]
 ];
 if(origin.kind==="ledger")return [
  ["الحركة",str("kind")],["العامل",str("worker_id")],
  ["المبلغ",money(Number(x.amount))],["التاريخ",time(str("occurred_at"))],
  ["مصدر الدفع",str("payment_source")],["مرجع المصروف",str("expense_id")],
  ["الملاحظات",str("notes")],["المرجع",origin.id]
 ];
 if(origin.kind==="bonus")return [
  ["التاريخ",str("shift_date")],["مبلغ الفريق الجماعي",money(Number(x.amount))],
  ["السبب",str("reason")],["المرجع",origin.id]
 ];
 return [
  ["تاريخ الموازنة",str("business_date")],["الكاش المسجل",money(Number(x.recorded_cash))],
  ["الكاش الفعلي",money(Number(x.actual_cash))],["الكاش المتوقع",money(Number(x.expected_cash??x.recorded_cash))],
  ["فرق الكاش",money(Number(x.cash_difference))],
  ["الشبكة المسجلة",money(Number(x.recorded_card))],
  ["الشبكة الفعلية",money(Number(x.terminal_card))],
  ["فرق الشبكة",money(Number(x.card_difference))],
  ["سبب الفرق",str("difference_reason")],["مرجع مرفق نقاط البيع",str("report_object_path")],
  ["المرجع",origin.id]
 ];
}

export function MonthlyReview({period}:{period:string}){
 const [entries,setEntries]=useState<Entry[]>([]);
 const [expenses,setExpenses]=useState<Expense[]>([]);
 const [days,setDays]=useState<Day[]>([]);
 const [settlements,setSettlements]=useState<Settlement[]>([]);
 const [bonuses,setBonuses]=useState<Bonus[]>([]);
 const [ledger,setLedger]=useState<Ledger[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [metric,setMetric]=useState<MetricKey|null>(null);
 const [selectedDay,setSelectedDay]=useState<string|null>(null);
 const [selectedRecord,setSelectedRecord]=useState<Origin|null>(null);
 const [lineItems,setLineItems]=useState<{line_no:number;label:string;amount:number;category:string}[]>([]);
 const boundaries=useMemo(()=>{
  const [year,month]=period.split("-").map(Number);
  const next=new Date(Date.UTC(year,month,1)).toISOString().slice(0,7);
  return {start:new Date(period+"-01T00:00:00+03:00").toISOString(),
   end:new Date(next+"-01T00:00:00+03:00").toISOString(),
   nextMonth:next,numberOfDays:new Date(Date.UTC(year,month,0)).getUTCDate()};
 },[period]);
 useEffect(()=>{
  setMetric(null);setSelectedDay(null);setSelectedRecord(null);
 },[period]);
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError("");
  async function load(){
   try{
    const [cars,spent,allDays,settled,extra,workerLedger]=await Promise.all([
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
     supabase.from("carwash_day_settlements").select("*")
      .gte("business_date",period+"-01").lt("business_date",boundaries.nextMonth+"-01"),
     supabase.from("crew_shift_bonuses").select("id,shift_date,amount,reason,created_at")
      .is("deleted_at",null)
      .gte("shift_date",period+"-01").lt("shift_date",boundaries.nextMonth+"-01"),
     fetchAllRows<Ledger>((from,to)=>supabase.from("worker_ledger")
      .select("id,worker_id,kind,amount,notes,payment_source,occurred_at,expense_id")
      .is("deleted_at",null).gte("occurred_at",boundaries.start).lt("occurred_at",boundaries.end)
      .order("occurred_at",{ascending:true}).range(from,to))
    ]);
    if(allDays.error||settled.error||extra.error)
     throw Error(allDays.error?.message||settled.error?.message||extra.error?.message||"تعذر التقرير");
    if(!cancelled){
     setEntries(cars);setExpenses(spent);setDays(allDays.data||[]);
     setSettlements((settled.data||[]) as Settlement[]);
     setBonuses((extra.data||[]) as Bonus[]);setLedger(workerLedger);
    }
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"تعذر جلب البيانات");}
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[period,boundaries]);
 const rows=useMemo(()=>{
  const map=new Map<string,Row>();
  function row(day:string){
   const prior=map.get(day);if(prior)return prior;
   const r:Row={date:day,cars:[],expenses:[],bonuses:[],ledger:[],dayStatus:null,settlement:null};
   map.set(day,r);return r;
  }
  for(const e of entries)row(entryDate(e)).cars.push(e);
  for(const e of expenses)row(riyadhDayKey(new Date(e.occurred_at))).expenses.push(e);
  for(const e of bonuses)row(e.shift_date).bonuses.push(e);
  for(const e of ledger)row(riyadhDayKey(new Date(e.occurred_at))).ledger.push(e);
  for(const d of days)row(d.business_date).dayStatus=d.status;
  for(const d of settlements)row(d.business_date).settlement=d;
  return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
 },[entries,expenses,days,settlements,bonuses,ledger]);
 const allMetrics=useMemo(()=>{
  const keys=Object.keys(metricInfo) as MetricKey[];
  const moneySum=(key:MetricKey)=>round(rows.reduce((total,row)=>total+sumOrigins(originsFor(row,key),key),0));
  const map={} as Record<MetricKey,number>;
  for(const key of keys)map[key]=moneySum(key);
  return map;
 },[rows]);
 const dayRows=useMemo(()=>{
  if(!metric)return [];
  return rows.map(r=>({row:r,items:originsFor(r,metric)}))
   .filter(p=>p.items.length>0);
 },[rows,metric]);
 const dayItems=dayRows.find(d=>d.row.date===selectedDay)?.items||[];
 const selectedDayTotal=metric?sumOrigins(dayItems,metric):0;
 const signedResult=operatingResult(allMetrics.revenue,allMetrics.expenses);
 const summaryCards:{key:MetricKey;value:string}[]=[
  {key:"cars",value:String(allMetrics.cars)},
  {key:"revenue",value:money(allMetrics.revenue)},
  {key:"cash",value:money(allMetrics.cash)},
  {key:"card",value:money(allMetrics.card)},
  {key:"expenses",value:money(allMetrics.expenses)},
  {key:"salary",value:money(allMetrics.salary)},
  {key:"wages_due",value:money(allMetrics.wages_due)},
  {key:"wages_paid",value:money(allMetrics.wages_paid)},
  {key:"bonuses",value:money(allMetrics.bonuses)},
  {key:"discounts",value:money(allMetrics.discounts)},
  {key:"provision",value:money(allMetrics.provision)},
  {key:"cash_diff",value:money(allMetrics.cash_diff)},
  {key:"card_diff",value:money(allMetrics.card_diff)},
  {key:"result",value:signedResult.label+" "+money(signedResult.amount)}
 ];
 useEffect(()=>{
  let cancelled=false;
  setLineItems([]);
  if(selectedRecord?.kind!=="car")return;
  supabase.from("carwash_entry_line_items").select("line_no,label,amount,category")
   .eq("entry_id",selectedRecord.id).order("line_no").then(({data,error})=>{
    if(!cancelled&&!error)setLineItems(data||[]);
   });
  return()=>{cancelled=true;};
 },[selectedRecord]);
 return <section className="card space-y-4">
  <h2 className="section-title">مراجعة شهر {period}</h2>
  {loading?<p className="txt-muted">جارٍ تحميل جميع قيود الشهر...</p>:
   error?<p className="txt-danger" role="alert">{error}</p>:<>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="مؤشرات الموازنة الشهرية">
    {summaryCards.map(card=><button type="button" key={card.key}
     aria-expanded={metric===card.key} onClick={()=>{setMetric(card.key);setSelectedDay(null);setSelectedRecord(null);}}
     className="metric-card tone-slate text-start w-full" style={{cursor:"pointer",border:metric===card.key?"2px solid var(--primary)":undefined}}>
     <span className="metric-label">{metricInfo[card.key].label}</span>
     <strong className="metric-value">{card.value}</strong>
    </button>)}
   </div>
   <div className="grid grid-cols-2 gap-3 text-sm">
    <div className="rounded-xl p-3 border" style={{borderColor:"var(--border)"}}>
     <div className="txt-muted">الأيام المعتمدة</div><strong>{days.filter(d=>d.status==="approved").length}</strong>
    </div>
    <div className="rounded-xl p-3 border" style={{borderColor:"var(--border)"}}>
     <div className="txt-muted">أيام لم تُعتمد</div><strong>{days.filter(d=>d.status!=="approved").length}</strong>
    </div>
   </div>
   <p className="txt-muted text-xs">{OPERATING_RESULT_NOTE} مخصص الفريق ليس مصروفًا مدفوعًا؛ دفع الرواتب لا يضيف مصروفًا ثانيًا.</p>
   {entries.some(e=>!e.business_date)&&<p className="txt-muted text-sm">
    تظهر العمليات المستوردة بتاريخ occurred_at بتوقيت الرياض؛ لم يُعدّل تاريخها الأصلي.
   </p>}
   {rows.some(r=>r.cars.some(c=>c.business_date)&&r.dayStatus!=="approved")&&<p className="txt-warning text-sm">
    توجد أيام تشغيلية تحتوي سيارات غير معتمدة؛ لا يمكن إغلاق الشهر قبل مراجعتها.
   </p>}
   {metric&&<div className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--border)"}}>
    <div className="flex flex-wrap gap-2 items-center justify-between">
     <h3 className="subsection-title">{metricInfo[metric].label}</h3>
     <button type="button" className="btn-secondary" onClick={()=>{setMetric(null);setSelectedDay(null);setSelectedRecord(null);}}>إغلاق التفاصيل</button>
    </div>
    <p className="txt-muted text-sm">{metricInfo[metric].explain}</p>
    {!selectedDay?<div className="space-y-2">
     <p className="text-sm">إجمالي الشهر: <strong>{metric==="cars"?allMetrics.cars:money(allMetrics[metric])}</strong> — {dayRows.length} أيام ذات قيود أصلية</p>
     {dayRows.length===0?<p className="txt-muted text-sm">لا توجد عمليات أصلية لهذا المؤشر.</p>:
     dayRows.map(({row,items})=><button type="button" key={row.date}
      className="w-full text-start rounded-xl border p-3 flex flex-wrap justify-between gap-2"
      style={{borderColor:"var(--border)",background:"var(--surface-2)"}}
      onClick={()=>{setSelectedDay(row.date);setSelectedRecord(null);}}>
      <span>{arabicDate(row.date)} — {items.length} قيود</span>
      <strong>{metric==="cars"?items.length:money(sumOrigins(items,metric))}</strong>
     </button>)}
    </div>:!selectedRecord?<div className="space-y-2">
     <button type="button" className="btn-secondary" onClick={()=>setSelectedDay(null)}>رجوع إلى أيام الشهر</button>
     <p className="font-bold">{arabicDate(selectedDay)} — {dayItems.length} قيود، إجمالي {metric==="cars"?dayItems.length:money(selectedDayTotal)}</p>
     {dayItems.map(item=><button type="button" key={item.kind+item.id}
      className="w-full text-start rounded-xl border p-3 flex flex-wrap justify-between gap-2"
      style={{borderColor:"var(--border)",background:"var(--surface-2)"}}
      onClick={()=>setSelectedRecord(item)}>
      <span>{item.label}</span><strong>{metric==="cars"?"1 سيارة":money(item.amount)}</strong>
     </button>)}
    </div>:<div className="space-y-3">
     <button type="button" className="btn-secondary" onClick={()=>setSelectedRecord(null)}>رجوع إلى قيود {arabicDate(selectedDay)}</button>
     <h4 className="font-bold">{selectedRecord.label}</h4>
     <dl className="space-y-2">
      {originDetail(selectedRecord).map(([name,value])=><div key={name} className="flex justify-between items-start gap-2 text-sm border-b pb-2" style={{borderColor:"var(--border)"}}>
       <dt className="txt-muted">{name}</dt><dd className="text-end break-words">{value}</dd>
      </div>)}
     </dl>
     {selectedRecord.kind==="car"&&lineItems.length>0&&<div className="space-y-1">
      <p className="font-bold">تفاصيل بنود الخدمة بالسعر التاريخي</p>
      {lineItems.map(i=><div className="flex justify-between gap-2 text-sm" key={i.line_no}>
       <span>{i.label} ({i.category})</span><strong>{money(Number(i.amount))}</strong>
      </div>)}
     </div>}
    </div>}
   </div>}
   <p className="txt-muted text-xs">يُحسب كل مؤشر من قيوده الأصلية. فروقات الجهاز وحركة دفع العامل ليست مصروفًا إضافيًا يُخصم من الربح.</p>
  </>}
 </section>;
}
