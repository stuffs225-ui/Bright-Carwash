"use client";
import "@/lib/chartRegistry";
import {useEffect,useMemo,useState} from "react";
import {Bar,Doughnut,Line} from "react-chartjs-2";
import {formatCurrency} from "@/lib/business";
import {riyadhDayKey} from "@/lib/carwashCalendarDay";
import {DemoRow,DemoExpense,readDemoFinance,demoDaily,demoMonths,demoCsv,sum,plusDay} from "@/lib/demoManagerData";
import {Modal} from "./Modal";
type Props={page:"dashboard"|"cars";rows:DemoRow[];statuses:Record<string,string>};
type Detail="cars"|"income"|"expenses"|"profit"|"cash"|"card"|"crew"|null;
const cash=(n:number)=>formatCurrency(Math.round(n*100)/100);
export function DemoManagerDashboard({page,rows,statuses}:Props){
 const [today,setToday]=useState(riyadhDayKey(new Date()));
 const [expenses,setExpenses]=useState<DemoExpense[]>([]);
 const [range,setRange]=useState<"today"|"week"|"month"|"year"|"all">("month");
 const [detail,setDetail]=useState<Detail>(null);
 const [selectedCar,setSelectedCar]=useState<DemoRow|null>(null);
 const [search,setSearch]=useState("");
 const [date,setDate]=useState("");
 useEffect(()=>{
  const update=()=>setExpenses(readDemoFinance(riyadhDayKey(new Date())).expenses);
  update();window.addEventListener("carwash-demo-financial-updated",update);
  const timer=setInterval(()=>setToday(riyadhDayKey(new Date())),30000);
  return()=>{window.removeEventListener("carwash-demo-financial-updated",update);clearInterval(timer);};
 },[]);
 const floor=range==="today"?today:range==="week"?plusDay(today,-6):
  range==="month"?today.slice(0,7)+"-01":range==="year"?today.slice(0,4)+"-01-01":"0000-01-01";
 const filteredCars=rows.filter(x=>x.day>=floor&&x.day<=today);
 const filteredExpenses=expenses.filter(x=>x.day>=floor&&x.day<=today);
 const income=sum(filteredCars.map(x=>x.cash+x.card));
 const expensesTotal=sum(filteredExpenses.map(x=>x.amount));
 const cashTotal=sum(filteredCars.map(x=>x.cash));
 const cardTotal=sum(filteredCars.map(x=>x.card));
 const crew=filteredCars.length*10;
 // A provisional operational estimate, NOT audited accounting profit.
 const net=income-expensesTotal-crew;
 const dayRows=useMemo(()=>demoDaily(filteredCars,filteredExpenses),[rows,expenses,floor,today]);
 const months=useMemo(()=>demoMonths(rows,expenses),[rows,expenses]);
 const chartDays=dayRows.slice(-14);
 const expenseKinds=useMemo(()=>{
  const out=new Map<string,number>();filteredExpenses.forEach(e=>out.set(e.type,(out.get(e.type)||0)+e.amount));
  return [...out.entries()];
 },[expenses,floor,today]);
 const periodLabels={today:"اليوم",week:"آخر 7 أيام",month:"الشهر الحالي",year:"السنة الحالية",all:"كل الفترات"};
 const cardRows=[
  {id:"cars" as const,label:"عدد السيارات",value:String(filteredCars.length)},
  {id:"income" as const,label:"إجمالي الإيرادات",value:cash(income)},
  {id:"expenses" as const,label:"إجمالي المصروفات",value:cash(expensesTotal)},
  {id:"profit" as const,label:"صافي الربح التقديري",value:cash(net)},
  {id:"cash" as const,label:"الكاش",value:cash(cashTotal)},
  {id:"card" as const,label:"الشبكة",value:cash(cardTotal)},
  {id:"crew" as const,label:"مخصص فريق العمال",value:cash(crew)},
 ];
 const carsTable=rows.filter(x=>(!date||x.day===date)&&(!search||[x.car,x.service,x.day].some(v=>v.includes(search))))
  .sort((a,b)=>b.day.localeCompare(a.day));
 if(page==="cars")return <div className="space-y-4" dir="rtl">
  <section className="card space-y-3">
   <h2 className="section-title">تفاصيل الإدخالات وجداول السيارات</h2>
   <p className="txt-muted">كل عملية قابلة للفتح مثل النظام الأصلي. المعطيات هنا وهمية من المعاينة، وليست بيانات العملاء.</p>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <label className="form-label">بحث في السيارات والخدمة
     <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="سيارة صغيرة أو غسيل..." />
    </label>
    <label className="form-label">فلترة بالتاريخ
     <input type="date" value={date} onChange={e=>setDate(e.target.value)}/>
    </label>
   </div>
   <div className="flex flex-wrap gap-2">
    <button className="btn-secondary" onClick={()=>{setDate("");setSearch("");}}>مسح الفلاتر</button>
    <button className="btn-primary" onClick={()=>demoCsv("carwash-cars-demo.csv",[
     ["اليوم","السيارة","الخدمة","كاش","شبكة","الإجمالي","حالة الاعتماد"],
     ...carsTable.map(x=>[x.day,x.car,x.service,x.cash,x.card,x.cash+x.card,statuses[x.day]||"open"])
    ])}>تصدير جدول السيارات Excel / CSV</button>
   </div>
   <p className="txt-muted text-sm">عدد السيارات المعروضة: {carsTable.length}</p>
  </section>
  <section className="card overflow-x-auto"><table className="app-table">
   <thead><tr><th>التاريخ</th><th>السيارة</th><th>الخدمة</th><th>كاش</th><th>شبكة</th><th>إجمالي</th><th>تفاصيل</th></tr></thead>
   <tbody>{carsTable.map(x=><tr key={x.id}>
    <td>{x.day}</td><td>{x.car}</td><td>{x.service}</td><td>{cash(x.cash)}</td><td>{cash(x.card)}</td>
    <td>{cash(x.cash+x.card)}</td><td><button className="btn-secondary" onClick={()=>setSelectedCar(x)}>فتح</button></td>
   </tr>)}</tbody>
  </table></section>
  {selectedCar&&<Modal title="تفاصيل تسجيل السيارة" onClose={()=>setSelectedCar(null)}>
   <div className="space-y-3">
    <p><strong>اليوم:</strong> {selectedCar.day}</p>
    <p><strong>النوع:</strong> {selectedCar.car}</p>
    <p><strong>الخدمة:</strong> {selectedCar.service}</p>
    <p><strong>الكاش:</strong> {cash(selectedCar.cash)}</p>
    <p><strong>الشبكة:</strong> {cash(selectedCar.card)}</p>
    <p><strong>الإجمالي:</strong> {cash(selectedCar.cash+selectedCar.card)}</p>
    <p><strong>مخصص العمال الجماعي:</strong> {cash(10)}</p>
    <p><strong>اعتماد اليوم:</strong> {statuses[selectedCar.day]==="approved"?"معتمد":"غير معتمد"}</p>
   </div>
  </Modal>}
 </div>;
 return <div className="space-y-4" dir="rtl">
  <section className="card">
   <h2 className="section-title">اللوحة الرئيسية الشاملة</h2>
   <p className="txt-muted text-sm">مطابقة للنطاق الوظيفي لنظام Google Apps Script: الدخل والمصروفات والربح، ورسوم وجداول حسب اليوم والشهر.</p>
   <div className="flex flex-wrap gap-2 mt-3">
    {(["today","week","month","year","all"] as const).map(choice=>
     <button type="button" key={choice} className={range===choice?"btn-primary":"btn-secondary"}
      onClick={()=>setRange(choice)}>{periodLabels[choice]}</button>)}
   </div>
   <p className="txt-warning mt-3 text-sm">جميع الأرقام أمثلة تجريبية. صافي الربح = الإيرادات − المصروفات − مخصص 10 ريالات لكل سيارة، ولا يمثل بيانًا ماليًا معتمدًا.</p>
  </section>
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
   {cardRows.map(c=><button key={c.id} type="button" onClick={()=>setDetail(c.id)}
    className="card text-center min-h-[105px] hover:brightness-105">
    <p className="txt-muted text-sm">{c.label}</p>
    <strong className="block mt-2 text-lg sm:text-xl">{c.value}</strong>
    <p className="txt-muted text-xs mt-2">اضغط لعرض التفاصيل</p>
   </button>)}
  </div>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
   <section className="card">
    <h3 className="subsection-title">تحليل الدخل والمصروفات اليومي</h3>
    <div className="h-[250px]"><Line data={{labels:chartDays.map(d=>d.day.slice(5)),
     datasets:[
      {label:"دخل المغسلة",data:chartDays.map(d=>d.cash+d.card),borderColor:"#10b981",tension:.25},
      {label:"مصروفات",data:chartDays.map(d=>d.expenses),borderColor:"#fb7185",tension:.25},
     ]}} options={{responsive:true,maintainAspectRatio:false,
       plugins:{legend:{labels:{color:"#94a3b8"}}},
       scales:{x:{ticks:{color:"#94a3b8"}},y:{ticks:{color:"#94a3b8"}}}}}/></div>
   </section>
   <section className="card">
    <h3 className="subsection-title">الكاش والشبكة</h3>
    <div className="h-[250px]"><Doughnut data={{labels:["كاش","شبكة"],
     datasets:[{data:[cashTotal,cardTotal],backgroundColor:["#10b981","#8b5cf6"]}]}}
     options={{maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{color:"#94a3b8"}}}}}/></div>
   </section>
   <section className="card">
    <h3 className="subsection-title">توزيع المصروفات حسب الفئة</h3>
    <div className="h-[250px]">{expenseKinds.length>0?<Doughnut
     data={{labels:expenseKinds.map(x=>x[0]),datasets:[{data:expenseKinds.map(x=>x[1]),
      backgroundColor:["#0ea5e9","#ef4444","#f59e0b","#10b981","#a855f7","#64748b","#f97316"]}]}}
     options={{maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{color:"#94a3b8"}}}}}/>:
     <p className="txt-muted">لا توجد مصروفات لهذه الفترة</p>}</div>
   </section>
   <section className="card">
    <h3 className="subsection-title">الدخل الشهري مقابل المصروفات</h3>
    <div className="h-[250px]"><Bar data={{labels:months.slice(0,7).reverse().map(m=>m.month),
     datasets:[
      {label:"الدخل",data:months.slice(0,7).reverse().map(m=>m.income),backgroundColor:"#0ea5e9"},
      {label:"المصروفات",data:months.slice(0,7).reverse().map(m=>m.expense),backgroundColor:"#fb7185"},
     ]}} options={{maintainAspectRatio:false,plugins:{legend:{labels:{color:"#94a3b8"}}},
     scales:{x:{ticks:{color:"#94a3b8"}},y:{ticks:{color:"#94a3b8"}}}}}/></div>
   </section>
  </div>
  <section className="card overflow-x-auto">
   <h3 className="subsection-title">ملخص الدخل اليومي وصافي الربح</h3>
   <table className="app-table"><thead><tr><th>التاريخ</th><th>السيارات</th><th>الكاش</th><th>الشبكة</th><th>المصروفات</th><th>العشرات</th><th>الصافي التقديري</th></tr></thead>
   <tbody>{dayRows.slice().reverse().map(d=><tr key={d.day}>
    <td>{d.day}</td><td>{d.cars}</td><td>{cash(d.cash)}</td><td>{cash(d.card)}</td><td>{cash(d.expenses)}</td>
    <td>{cash(d.crew)}</td><td>{cash(d.cash+d.card-d.expenses-d.crew)}</td>
   </tr>)}</tbody></table>
  </section>
  <section className="card overflow-x-auto">
   <h3 className="subsection-title">الملخص المالي الشهري</h3>
   <table className="app-table"><thead><tr><th>الشهر</th><th>السيارات</th><th>الإيرادات</th><th>المصروفات</th><th>العشرات</th><th>الصافي التقديري</th></tr></thead>
   <tbody>{months.map(m=><tr key={m.month}>
    <td>{m.month}</td><td>{m.cars}</td><td>{cash(m.income)}</td><td>{cash(m.expense)}</td>
    <td>{cash(m.crew)}</td><td>{cash(m.income-m.expense-m.crew)}</td>
   </tr>)}</tbody></table>
  </section>
  {detail&&<Modal title="تفاصيل المؤشر" onClose={()=>setDetail(null)}>
   <p className="font-semibold mb-3">{detail==="profit"?
    "الإيرادات "+cash(income)+" − المصروفات "+cash(expensesTotal)+" − مستحق العشرات "+cash(crew)+" = "+cash(net):
    detail==="crew"?"10 ريالات جماعية × "+filteredCars.length+" سيارة = "+cash(crew):
    detail==="income"?"الإيرادات "+cash(income):detail==="expenses"?"المصروفات "+cash(expensesTotal):
    detail==="cash"?"الكاش "+cash(cashTotal):detail==="card"?"الشبكة "+cash(cardTotal):
    "عدد السيارات "+filteredCars.length}</p>
   <div className="space-y-2 max-h-[60vh] overflow-auto">
    {(detail==="expenses"||detail==="profit")&&filteredExpenses.map(e=>
     <div key={e.id} className="flex justify-between gap-2 border-b py-2"><span>{e.day} · {e.type} · {e.notes}</span><strong>{cash(e.amount)}</strong></div>)}
    {detail!=="expenses"&&filteredCars.filter(e=>detail==="cash"?e.cash>0:detail==="card"?e.card>0:true).map(e=>
     <div key={e.id} className="flex justify-between gap-2 border-b py-2"><span>{e.day} · {e.car} · {e.service}</span>
      <strong>{detail==="crew"?cash(10):detail==="cash"?cash(e.cash):detail==="card"?cash(e.card):cash(e.cash+e.card)}</strong></div>)}
   </div>
  </Modal>}
 </div>;
}
