"use client";
import {useEffect,useMemo,useState} from "react";
import {riyadhDayKey,dayIsFinished} from "@/lib/carwashCalendarDay";
import {formatCurrency} from "@/lib/business";
import {InstallAppButton} from "./InstallAppButton";
import {ServiceWorkerRegister} from "./ServiceWorkerRegister";
import {DemoManagerDashboard} from "./DemoManagerDashboard";
import {DemoManagerOperations} from "./DemoManagerOperations";
import {plusDay,type DemoManagerPage,saveDemoFinance,defaultDemoFinance} from "@/lib/demoManagerData";

type Row={id:string;day:string;car:"سيارة صغيرة"|"سيارة كبيرة";
  service:string;cash:number;card:number;ready:boolean};
type Status="open"|"awaiting_owner"|"approved";
type DemoState={rows:Row[];statuses:Record<string,Status>};
type Role="manager"|"worker";
const KEY="carwash_demo_preview_not_real_v3";
const managerPages:{key:DemoManagerPage;label:string}[]=[
 {key:"dashboard",label:"📊 اللوحة الرئيسية"},
 {key:"cars",label:"🚘 السيارات"},
 {key:"expenses",label:"💳 المصروفات"},
 {key:"workers",label:"👷 العمال والرواتب"},
 {key:"reports",label:"📄 التقارير"},
 {key:"settlement",label:"🧾 موازنة الأيام"},
 {key:"settings",label:"⚙️ الإعدادات"},
 {key:"alerts",label:"🔔 التنبيهات"},
 {key:"users",label:"📱 حساب العامل"},
];
function yesterday(today:string){
 const date=new Date(today+"T12:00:00+03:00");
 date.setUTCDate(date.getUTCDate()-1);
 return riyadhDayKey(date);
}
function seed(today:string):DemoState{
 const rows:Row[]=[];
 const statuses:Record<string,Status>={};
 for(let ago=29;ago>=0;ago--){
  const date=plusDay(today,-ago);
  statuses[date]=ago>1?"approved":"open";
  const count=ago===0?1:ago===1?2:3+(ago%5);
  for(let i=0;i<count;i++){
   const large=(i+ago)%3===0;
   const fee=large?30:25;
   const pay=(i+ago)%3;
   rows.push({id:"demo-"+ago+"-"+i,day:date,
    car:large?"سيارة كبيرة":"سيارة صغيرة",service:"غسيل كامل",
    cash:pay===0?fee:pay===2?fee/2:0,
    card:pay===1?fee:pay===2?fee/2:0,ready:i%3===0});
  }
 }
 return {rows,statuses};
}
function totals(rows:Row[]){return {
 count:rows.length,cash:rows.reduce((n,r)=>n+r.cash,0),
 card:rows.reduce((n,r)=>n+r.card,0),crew:rows.length*10
};}
function snapshot():DemoState{
 const today=riyadhDayKey(new Date());
 try{
  const cached=sessionStorage.getItem(KEY);
  if(cached){
   const parsed=JSON.parse(cached) as DemoState;
   if(Array.isArray(parsed.rows)&&parsed.statuses)return parsed;
  }
 }catch{}
 return seed(today);
}
export function DemoCarwashApp(){
 const [started,setStarted]=useState(false);
 const [role,setRole]=useState<Role>("manager");
 const [managerPage,setManagerPage]=useState<DemoManagerPage>("dashboard");
 const [now,setNow]=useState<Date>(new Date());
 const [data,setData]=useState<DemoState|null>(null);
 const [car,setCar]=useState<Row["car"]>("سيارة صغيرة");
 const [method,setMethod]=useState<"cash"|"card"|"mixed">("cash");
 const [selectedDay,setSelectedDay]=useState<string|null>(null);
 const [cashActual,setCashActual]=useState("");
 const [cardActual,setCardActual]=useState("");
 const [reason,setReason]=useState("");
 const [workerPhone,setWorkerPhone]=useState("");
 const [demoWorkerAdded,setDemoWorkerAdded]=useState(false);
 useEffect(()=>{setData(snapshot());const clock=setInterval(()=>setNow(new Date()),15000);return()=>clearInterval(clock)},[]);
 useEffect(()=>{if(data){sessionStorage.setItem(KEY,JSON.stringify(data));}},[data]);
 const today=riyadhDayKey(now);
 const dateKeys=useMemo(()=>{
  if(!data)return [];
  const all=new Set([...data.rows.map(r=>r.day),...Object.keys(data.statuses),today]);
  return [...all].sort((a,b)=>b.localeCompare(a));
 },[data,today]);
 const safeData=data||seed(today);
 const visibleDates=dateKeys.filter(d=>role!=="worker"||safeData.statuses[d]!=="approved");
 const activeDay=selectedDay&&dateKeys.includes(selectedDay)?selectedDay:visibleDates[0]||today;
 const activeRows=safeData.rows.filter(r=>r.day===activeDay);
 const agg=totals(activeRows);
 const pending=safeData.rows.filter(r=>safeData.statuses[r.day]!=="approved");
 const all=totals(pending);
 const setState=(f:(d:DemoState)=>DemoState)=>setData(d=>f(d||seed(today)));
 function addCar(){
  const price=car==="سيارة صغيرة"?25:30;
  const cash=method==="cash"?price:method==="mixed"?price/2:0;
  const card=price-cash;
  setState(d=>({statuses:{...d.statuses,[today]:"open"},rows:[...d.rows,{
    id:"demo-"+crypto.randomUUID(),day:today,car,service:"غسيل كامل",cash,card,ready:false
  }]}));
 }
 function approve(){
  if(!dayIsFinished(activeDay,now)){alert("لا يمكن إقفال يوم الرياض الحالي قبل الساعة 12 منتصف الليل.");return;}
  if(safeData.statuses[activeDay]!=="open"){alert("هذا اليوم ليس مفتوحًا للاعتماد.");return;}
  if(cashActual.trim()===""||cardActual.trim()===""||
    !Number.isFinite(Number(cashActual))||!Number.isFinite(Number(cardActual))||
    Number(cashActual)<0||Number(cardActual)<0){alert("أدخل مبالغ الكاش والشبكة الصحيحة.");return;}
  const cashDifference=Number(cashActual)-agg.cash;
  const cardDifference=Number(cardActual)-agg.card;
  const hasDifference=Math.abs(cashDifference)>0.001||Math.abs(cardDifference)>0.001;
  if(hasDifference&&reason.trim().length<5){alert("اشرح سبب الفرق للمراجعة قبل اعتماده.");return;}
  setState(d=>({...d,statuses:{...d.statuses,[activeDay]:"approved"}}));
  setCashActual("");setCardActual("");setReason("");
  alert(hasDifference?"اعتمد المدير فرق اليوم مع السبب في التجربة.":"تم اعتماد هذا اليوم؛ اختفت سجلاته من شاشة العامل فقط.");
 }
 if(!started)return <div dir="rtl" className="min-h-screen flex items-center justify-center px-4 py-10">
  <div className="card max-w-xl w-full space-y-5">
   <div className="rounded-xl p-4" style={{background:"var(--surface-3)"}}>
    <h1 className="text-2xl font-extrabold">مغسلة سيارتك اللامعة</h1>
    <p className="text-sm txt-muted mt-2">معاينة تفاعلية آمنة — نسخة التطوير</p>
   </div>
   <p className="txt-warning font-semibold">قاعدة بيانات المغسلة وتسجيل دخول SMS غير جاهزين بعد. المعاينة بلا حساب حقيقي، ولا تحفظ بيانات العملاء، ولا ترسل رسائل أو تسجل مدفوعات فعلية.</p>
   <p>يمكنك الآن فتح واجهة المدير والعامل وتجربة انتقال الأيام والاعتماد والتفاصيل، ببيانات وهمية داخل جلسة المتصفح فقط.</p>
   <button type="button" className="btn-primary w-full" onClick={()=>{setStarted(true);setRole("manager");}}>فتح لوحة المدير التجريبية</button>
   <button type="button" className="btn-secondary w-full" onClick={()=>{setStarted(true);setRole("worker");}}>فتح شاشة العامل التجريبية</button>
   <InstallAppButton />
   <ServiceWorkerRegister />
  </div>
 </div>;
 return <div className="app-shell space-y-4" dir="rtl">
  <ServiceWorkerRegister />
  <header className="app-header rounded-xl">
   <h1 className="text-2xl font-bold">مغسلة سيارتك اللامعة</h1>
   <p className="mt-2">وضع تجربة محلي — لا توجد عمليات حقيقية أو رسائل SMS</p>
   <div className="flex flex-wrap gap-2 justify-center mt-4">
    {(["manager","worker"] as Role[]).map(r=><button key={r} type="button"
      className={role===r?"btn-primary":"btn-secondary"} onClick={()=>{setRole(r);setSelectedDay(null);}}>
      {r==="manager"?"👔 المدير — إدارة كاملة":"🚗 العامل — تسجيل فقط"}
    </button>)}
   </div>
   <div className="flex flex-wrap justify-center gap-2 mt-3"><InstallAppButton />
    <button className="btn-secondary" type="button" onClick={()=>{
      if(confirm("إعادة ضبط جميع البيانات التجريبية فقط؟")){sessionStorage.removeItem(KEY);saveDemoFinance(defaultDemoFinance(today));setData(seed(today));}
    }}>إعادة ضبط بيانات التجربة</button>
   </div>
  </header>
  {role==="manager"&&<nav className="card flex overflow-x-auto gap-2" aria-label="أقسام الإدارة">
   {managerPages.map(p=><button type="button" key={p.key}
    className={(managerPage===p.key?"btn-primary":"btn-secondary")+" shrink-0"}
    onClick={()=>setManagerPage(p.key)}>{p.label}</button>)}
  </nav>}
  <div className="card">
   <p className="txt-warning font-bold">البيانات في هذا العرض وهمية ولا تُرسل إلى GitHub أو Supabase. لا تستخدمه لمعاملات العملاء.</p>
   <p className="txt-muted text-sm">التوقيت المحاسبي: الرياض، 12:00 صباحًا إلى 11:59 مساءً. اليوم: {today}</p>
  </div>
  {role==="worker"?<>
   <section className="card">
    <h2 className="section-title">تسجيل سيارة — عامل (تجربة)</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
     <label className="form-label">نوع السيارة<select value={car} onChange={e=>setCar(e.target.value as Row["car"])}>
      <option value="سيارة صغيرة">سيارة صغيرة — 25 ر.س</option><option value="سيارة كبيرة">سيارة كبيرة — 30 ر.س</option>
     </select></label>
     <label className="form-label">طريقة الدفع<select value={method} onChange={e=>setMethod(e.target.value as typeof method)}>
      <option value="cash">كاش</option><option value="card">شبكة</option><option value="mixed">مختلط</option>
     </select></label>
    </div>
    <button type="button" className="btn-add-car w-full mt-3" onClick={addCar}>+ تسجيل سيارة تجريبية لليوم</button>
   </section>
   <section className="grid grid-cols-2 gap-3">
    <div className="card text-center"><p className="txt-muted">السيارات غير المعتمدة</p><strong className="text-2xl">{all.count}</strong></div>
    <div className="card text-center"><p className="txt-muted">مجموع عشرات العمال</p><strong className="text-2xl">{formatCurrency(all.crew)}</strong></div>
   </section>
   <div className="space-y-3">{visibleDates.map(day=>{
     const rows=safeData.rows.filter(r=>r.day===day);const t=totals(rows);
     return <section key={day} className="card">
       <button type="button" className="section-title w-full text-start" onClick={()=>setSelectedDay(selectedDay===day?null:day)}>
        {day===today?"اليوم":"يوم سابق"} · {day} · {t.count} سيارة · {formatCurrency(t.crew)} عشرات
       </button>
       <p className="txt-muted text-sm">الحالة: {safeData.statuses[day]==="awaiting_owner"?"فرق يحتاج اعتماد المدير":"لم يعتمد المدير بعد"}</p>
       {(selectedDay===day || selectedDay===null)&&rows.map(r=><div key={r.id} className="border-b py-3 flex items-center justify-between gap-3">
        <div>{r.car} · {r.service}<p className="txt-muted text-sm">كاش {formatCurrency(r.cash)} · شبكة {formatCurrency(r.card)}</p></div>
        <button type="button" className="btn-secondary" onClick={()=>{
          if(confirm("تغيير حالة الجاهزية التجريبية؟"))setState(d=>({...d,rows:d.rows.map(x=>x.id===r.id?{...x,ready:!x.ready}:x)}));
        }}>{r.ready?"جاهزة":"سيارة جاهزة؟"}</button>
       </div>)}
     </section>
    })}</div>
  </>:<>
   {(managerPage==="dashboard"||managerPage==="cars")&&
    <DemoManagerDashboard page={managerPage} rows={safeData.rows} statuses={safeData.statuses}/>}
   {(managerPage==="expenses"||managerPage==="workers"||managerPage==="reports"||
      managerPage==="settings"||managerPage==="alerts")&&
    <DemoManagerOperations key={managerPage} page={managerPage} rows={safeData.rows}/>}
   {managerPage==="settlement"&&<>
   <section className="card space-y-3">
    <h2 className="section-title">مراجعة الموازنة بحسب اليوم</h2>
    <div className="flex flex-wrap gap-2">{dateKeys.map(day=><button type="button" key={day} className={day===activeDay?"btn-primary":"btn-secondary"} onClick={()=>{setSelectedDay(day);setCashActual("");setCardActual("");}}>
      {day} {safeData.statuses[day]==="approved"?"✓":""}
    </button>)}</div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
     <div className="card text-center">السيارات <strong className="block text-2xl">{agg.count}</strong></div>
     <div className="card text-center">الكاش <strong className="block">{formatCurrency(agg.cash)}</strong></div>
     <div className="card text-center">الشبكة <strong className="block">{formatCurrency(agg.card)}</strong></div>
     <div className="card text-center">العشرات الجماعية <strong className="block">{formatCurrency(agg.crew)}</strong></div>
    </div>
    {activeRows.map(r=><details key={r.id} className="border-b py-3"><summary className="cursor-pointer">{r.car} · المقبوض {formatCurrency(r.cash+r.card)}</summary>
     <p>خدمة: {r.service} · كاش {formatCurrency(r.cash)} · شبكة {formatCurrency(r.card)} · عشرات الفريق 10.00 ر.س · {r.ready?"جاهزة":"قيد الغسيل"}</p></details>)}
    {safeData.statuses[activeDay]==="approved"?<p className="txt-muted">اليوم معتمد ومحفوظ في أرشيف الإدارة.</p>:
     dayIsFinished(activeDay,now)?<>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
       <label className="form-label">الكاش الفعلي<input type="number" min="0" value={cashActual} onChange={e=>setCashActual(e.target.value)} /></label>
       <label className="form-label">إجمالي تقرير الشبكة<input type="number" min="0" value={cardActual} onChange={e=>setCardActual(e.target.value)} /></label>
      </div>
      <label className="form-label">سبب الفرق إن وجد<input type="text" value={reason} onChange={e=>setReason(e.target.value)} /></label>
      <button type="button" className="btn-primary w-full" onClick={approve}>اعتماد موازنة {activeDay} (محاكاة)</button>
     </>:<p className="txt-muted">لا يمكن اعتماد يوم {today} قبل 12 منتصف الليل؛ يمكنك اعتماد اليوم السابق.</p>}
   </section>
   </>}
   {managerPage==="users"&&<section className="card space-y-3">
    <h2 className="section-title">إضافة رقم العامل من حساب المدير</h2>
    <p className="txt-warning text-sm">هذه تجربة واجهة فقط؛ الرقم لا يُحفظ في قاعدة بيانات ولا تنطلق إليه رسالة SMS.</p>
    <label className="form-label">رقم العامل<input type="tel" value={workerPhone} onChange={e=>setWorkerPhone(e.target.value)} placeholder="05XXXXXXXX" /></label>
    <button type="button" className="btn-secondary" onClick={()=>{if(!/^05\d{8}$/.test(workerPhone)){alert("رقم سعودي غير صحيح");return;}setDemoWorkerAdded(true);setWorkerPhone("");}}>تجربة إضافة حساب عامل</button>
    {demoWorkerAdded&&<p className="text-sm txt-cash">نجحت محاكاة الإضافة فقط. التفعيل الفعلي يحتاج قاعدة البيانات ومزود SMS.</p>}
   </section>}
  </>}
 </div>;
}
