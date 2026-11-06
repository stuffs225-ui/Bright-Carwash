"use client";
import {useEffect,useMemo,useState} from "react";
import {formatCurrency} from "@/lib/business";
import {riyadhDayKey} from "@/lib/carwashCalendarDay";
import {DemoRow,DemoExpense,DemoWage,DemoFinance,readDemoFinance,saveDemoFinance,defaultDemoFinance,plusDay,demoMonths,demoCsv,sum} from "@/lib/demoManagerData";
import {Modal} from "./Modal";
type Page="expenses"|"workers"|"reports"|"settings"|"alerts";
const money=(n:number)=>formatCurrency(Math.round(n*100)/100);
export function DemoManagerOperations({page,rows}:{page:Page;rows:DemoRow[]}){
 const today=riyadhDayKey(new Date());
 const [data,setData]=useState<DemoFinance|null>(null);
 const [kind,setKind]=useState("مواد تنظيف");
 const [amount,setAmount]=useState("");
 const [when,setWhen]=useState(today);
 const [notes,setNotes]=useState("");
 const [editing,setEditing]=useState<string|null>(null);
 const [worker,setWorker]=useState("فريق المغسلة");
 const [workerKind,setWorkerKind]=useState<DemoWage["kind"]>("مكافأة");
 const [workerAmount,setWorkerAmount]=useState("");
 const [workerNote,setWorkerNote]=useState("");
 const [reportMonth,setReportMonth]=useState(today.slice(0,7));
 const [reportDetail,setReportDetail]=useState(false);
 const [goal,setGoal]=useState("");
 const [threshold,setThreshold]=useState("");
 const [services,setServices]=useState([{name:"غسيل كامل — سيارة صغيرة",price:25},
  {name:"غسيل كامل — سيارة كبيرة",price:30}]);
 const [serviceName,setServiceName]=useState("");
 const [servicePrice,setServicePrice]=useState("");
 const [stocks,setStocks]=useState([{name:"شامبو سيارات",qty:8,min:5,unit:"لتر"},
  {name:"منظف زجاج",qty:3,min:4,unit:"لتر"},
  {name:"فوط تنظيف",qty:19,min:10,unit:"قطعة"}]);
 const [newStock,setNewStock]=useState("");
 const [stockQty,setStockQty]=useState("");
 const [stockUnit,setStockUnit]=useState("قطعة");
 useEffect(()=>setData(readDemoFinance(today)),[today]);
 const state=data||defaultDemoFinance(today);
 const expenses=state.expenses;
 const wages=state.wages;
 const months=useMemo(()=>demoMonths(rows,expenses),[rows,expenses]);
 const currentMonthExpenses=expenses.filter(e=>e.day.slice(0,7)===today.slice(0,7));
 const lastMonth=plusDay(today,-31).slice(0,7);
 const lastMonthExpenses=expenses.filter(e=>e.day.slice(0,7)===lastMonth);
 function change(updater:(old:DemoFinance)=>DemoFinance){
  setData(prev=>{const next=updater(prev||defaultDemoFinance(today));saveDemoFinance(next);return next;});
 }
 function resetExpense(){
  setEditing(null);setAmount("");setNotes("");setWhen(today);setKind("مواد تنظيف");
 }
 function saveExpense(){
  const n=Number(amount);
  if(!Number.isFinite(n)||n<=0||!when||!kind){alert("أدخل نوع المصروف والمبلغ والتاريخ بشكل صحيح.");return;}
  const item={id:editing||crypto.randomUUID(),day:when,type:kind,amount:n,notes};
  change(d=>({...d,expenses:editing?d.expenses.map(e=>e.id===editing?item:e):[item,...d.expenses]}));
  resetExpense();
 }
 function editExpense(exp:DemoExpense){
  setEditing(exp.id);setKind(exp.type);setAmount(String(exp.amount));setWhen(exp.day);setNotes(exp.notes);
 }
 function deleteExpense(id:string){
  if(confirm("حذف المصروف التجريبي فقط؟"))change(d=>({...d,expenses:d.expenses.filter(e=>e.id!==id)}));
 }
 function saveWage(){
  const n=Number(workerAmount);
  if(!worker.trim()||!Number.isFinite(n)||n<=0){alert("أدخل الفريق أو العامل والمبلغ.");return;}
  change(d=>({...d,wages:[{id:crypto.randomUUID(),day:today,name:worker,kind:workerKind,amount:n,notes:workerNote},...d.wages]}));
  setWorkerAmount("");setWorkerNote("");
 }
 const reportCars=rows.filter(r=>r.day.slice(0,7)===reportMonth);
 const reportExpenses=expenses.filter(e=>e.day.slice(0,7)===reportMonth);
 const reportIncome=sum(reportCars.map(r=>r.cash+r.card));
 const reportOut=sum(reportExpenses.map(e=>e.amount));
 const reportCrew=reportCars.length*10;
 const reportNet=reportIncome-reportOut-reportCrew;
 if(page==="expenses")return <div className="space-y-4">
  <section className="card"><h2 className="section-title">لوحة تحكم المصروفات</h2>
   <p className="txt-muted">نفس فكرة النظام السابق: مصروفات الشهر الحالي والسابق، متوسط الصرف، وتفاصيل كل مصروف. البيانات وهمية للعرض فقط.</p>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
    {[["مصروفات الشهر الحالي",sum(currentMonthExpenses.map(x=>x.amount))],
      ["مصروفات الشهر السابق",sum(lastMonthExpenses.map(x=>x.amount))],
      ["عدد المصروفات",expenses.length],
      ["متوسط المصروف",expenses.length?sum(expenses.map(e=>e.amount))/expenses.length:0]
    ].map(([label,n],i)=><div key={String(label)} className="card text-center">
     <p className="txt-muted">{label}</p><strong className="block mt-2 text-lg">
      {i===2?n:money(Number(n))}</strong>
    </div>)}
   </div>
  </section>
  <section className="card space-y-3"><h3 className="subsection-title">{editing?"تعديل المصروف":"إضافة مصروف جديد"}</h3>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <label className="form-label">نوع المصروف<select value={kind} onChange={e=>setKind(e.target.value)}>
     {["مواد تنظيف","رواتب","صيانة","إيجار","كهرباء ومياه","قطع غيار","أخرى"].map(k=><option key={k}>{k}</option>)}
    </select></label>
    <label className="form-label">المبلغ (ريال)<input type="number" min="0" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} /></label>
    <label className="form-label">تاريخ المصروف الحقيقي<input type="date" value={when} onChange={e=>setWhen(e.target.value)} /></label>
    <label className="form-label">سبب / ملاحظات (خاصة بالمصروف المتأخر)
     <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="وصف المصروف" /></label>
   </div>
   <p className="txt-warning text-sm">إضافة مصروف لشهر معتمد في النسخة الفعلية تستلزم إعادة فتح التقرير واعتماده. هنا محاكاة مالية لا تتصل بقاعدة بيانات.</p>
   <div className="flex flex-wrap gap-2">
    <button className="btn-primary" onClick={saveExpense}>{editing?"حفظ تعديل المصروف":"حفظ المصروف"}</button>
    {editing&&<button className="btn-secondary" onClick={resetExpense}>إلغاء</button>}
   </div>
  </section>
  <section className="card overflow-x-auto"><h3 className="subsection-title">تفاصيل المصروفات الشهرية واليومية</h3>
   <table className="app-table"><thead><tr><th>التاريخ</th><th>الفئة</th><th>المبلغ</th><th>الوصف</th><th>العمليات</th></tr></thead>
    <tbody>{expenses.slice().sort((a,b)=>b.day.localeCompare(a.day)).map(e=><tr key={e.id}>
     <td>{e.day}</td><td>{e.type}</td><td>{money(e.amount)}</td><td>{e.notes}</td>
     <td className="whitespace-nowrap"><button className="btn-secondary" onClick={()=>editExpense(e)}>تعديل</button>
      <button className="btn-secondary" onClick={()=>deleteExpense(e.id)}>حذف</button></td>
    </tr>)}</tbody></table>
  </section>
 </div>;

 if(page==="workers")return <div className="space-y-4">
  <section className="card"><h2 className="section-title">إدارة الفرق والعمال</h2>
   <p className="txt-muted">سجل المبالغ والمكافآت والسلف والرواتب، مع فصل المخصص المستحق عن المدفوع فعليًا.</p>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {[["السيارات",rows.length],["العشرات الجماعية",rows.length*10],
      ["المكافآت الإضافية",sum(wages.filter(x=>x.kind==="مكافأة").map(x=>x.amount))],
      ["الرواتب والسلف والمدفوعات",sum(wages.filter(x=>x.kind!=="مكافأة").map(x=>x.amount))]
    ].map(([label,n],i)=><div key={String(label)} className="card text-center">
     <p className="txt-muted">{label}</p><strong className="block text-lg mt-2">{i===0?n:money(Number(n))}</strong></div>)}
   </div>
  </section>
  <section className="card space-y-3">
   <h3 className="subsection-title">تسجيل مكافأة من المدير أو سلفة أو راتب</h3>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <label className="form-label">اسم العامل / الفريق<input value={worker} onChange={e=>setWorker(e.target.value)} /></label>
    <label className="form-label">نوع الحركة<select value={workerKind} onChange={e=>setWorkerKind(e.target.value as DemoWage["kind"])}>
     {(["مكافأة","سلفة","راتب","صرف مستحقات"] as const).map(k=><option key={k}>{k}</option>)}</select></label>
    <label className="form-label">المبلغ<input type="number" min="0" step=".01" value={workerAmount} onChange={e=>setWorkerAmount(e.target.value)} /></label>
    <label className="form-label">ملاحظات<input value={workerNote} onChange={e=>setWorkerNote(e.target.value)} /></label>
   </div>
   <button className="btn-primary" onClick={saveWage}>حفظ الحركة التجريبية</button>
  </section>
  <section className="card overflow-x-auto"><h3 className="subsection-title">كشف حساب العامل / الفريق</h3>
   <table className="app-table"><thead><tr><th>اليوم</th><th>الاسم</th><th>نوع الحركة</th><th>المبلغ</th><th>الوصف</th></tr></thead>
   <tbody>{wages.map(w=><tr key={w.id}><td>{w.day}</td><td>{w.name}</td><td>{w.kind}</td>
    <td>{money(w.amount)}</td><td>{w.notes}</td></tr>)}</tbody></table>
   <p className="txt-warning text-sm">لا تعتبر هذه أرصدة فعلية. في نظام التشغيل يجب منع تكرار احتساب عشرات العمال عند صرفها.</p>
  </section>
 </div>;

 if(page==="reports")return <div className="space-y-4">
  <section className="card space-y-3"><h2 className="section-title">التقرير الشهري المفصل</h2>
   <label className="form-label">اختر الشهر
    <input type="month" value={reportMonth} onChange={e=>setReportMonth(e.target.value)} /></label>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {[["السيارات",reportCars.length],["الإيرادات",reportIncome],["المصروفات",reportOut],["الصافي التقديري",reportNet]]
     .map(([label,n],i)=><div className="card text-center" key={String(label)}>
      <p className="txt-muted">{label}</p><strong className="text-lg block mt-2">{i===0?n:money(Number(n))}</strong></div>)}
   </div>
   <div className="flex flex-wrap gap-2">
    <button className="btn-primary" onClick={()=>setReportDetail(true)}>عرض تفاصيل التقرير</button>
    <button className="btn-secondary" onClick={()=>demoCsv("carwash-report-"+reportMonth+"-cars.csv",[
     ["التاريخ","السيارة","الخدمة","كاش","شبكة"],...reportCars.map(r=>[r.day,r.car,r.service,r.cash,r.card])
    ])}>تصدير السيارات Excel/CSV</button>
    <button className="btn-secondary" onClick={()=>demoCsv("carwash-report-"+reportMonth+"-expenses.csv",[
     ["التاريخ","نوع المصروف","المبلغ","ملاحظات"],...reportExpenses.map(r=>[r.day,r.type,r.amount,r.notes])
    ])}>تصدير المصروفات Excel/CSV</button>
    <button className="btn-secondary" onClick={()=>window.print()}>طباعة / PDF عبر المتصفح</button>
   </div>
   <p className="txt-warning text-sm">هذه تقارير معاينة غير معتمدة؛ زر الطباعة يحفظ صفحة الويب وليس ملف التقرير التنفيذي النهائي.</p>
  </section>
  <section className="card overflow-x-auto"><h3 className="subsection-title">المقارنة الشهرية</h3>
   <table className="app-table"><thead><tr><th>الشهر</th><th>السيارات</th><th>الإيراد</th><th>المصروف</th><th>العشرات</th><th>الصافي التقديري</th></tr></thead>
   <tbody>{months.map(m=><tr key={m.month}><td>{m.month}</td><td>{m.cars}</td><td>{money(m.income)}</td>
    <td>{money(m.expense)}</td><td>{money(m.crew)}</td><td>{money(m.income-m.expense-m.crew)}</td></tr>)}</tbody></table>
  </section>
  {reportDetail&&<Modal title={"التقرير المالي لشهر "+reportMonth} onClose={()=>setReportDetail(false)}>
   <p>عدد السيارات: {reportCars.length}</p><p>الكاش: {money(sum(reportCars.map(x=>x.cash)))}</p>
   <p>الشبكة: {money(sum(reportCars.map(x=>x.card)))}</p><p>الإيرادات: {money(reportIncome)}</p>
   <p>المصروفات: {money(reportOut)}</p><p>العشرات: {money(reportCrew)}</p>
   <strong>صافي الربح التقديري: {money(reportNet)}</strong>
  </Modal>}
 </div>;

 if(page==="settings")return <div className="space-y-4">
  <section className="card space-y-3"><h2 className="section-title">الإعدادات وتخصيص لوحة التحكم</h2>
   <p className="txt-warning">تغييرات المعاينة لا تضبط أسعار العملاء الحقيقية أو حسابات العمال.</p>
   <label className="form-label">هدف الدخل الشهري<input type="number" min="0" placeholder={String(state.monthlyGoal)}
    value={goal} onChange={e=>setGoal(e.target.value)} /></label>
   <button className="btn-primary" onClick={()=>{const n=Number(goal);if(!goal||!Number.isFinite(n)||n<0){alert("أدخل هدفًا صحيحًا.");return;}change(d=>({...d,monthlyGoal:n}));setGoal("");}}>
    حفظ هدف الشهر</button>
   <p className="txt-muted">الهدف الحالي: {money(state.monthlyGoal)}</p>
  </section>
  <section className="card space-y-3"><h3 className="subsection-title">قائمة أسعار خدمات الغسيل</h3>
   {services.map(s=><div key={s.name} className="flex justify-between border-b py-3">
    <span>{s.name}</span><strong>{money(s.price)}</strong></div>)}
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <label className="form-label">خدمة جديدة<input value={serviceName} onChange={e=>setServiceName(e.target.value)} /></label>
    <label className="form-label">السعر<input type="number" min="0" value={servicePrice} onChange={e=>setServicePrice(e.target.value)} /></label>
   </div>
   <button className="btn-primary" onClick={()=>{
    const n=Number(servicePrice);if(!serviceName.trim()||!Number.isFinite(n)||n<=0){alert("راجع اسم الخدمة وسعرها.");return;}
    setServices(v=>[...v,{name:serviceName.trim(),price:n}]);setServiceName("");setServicePrice("");
   }}>إضافة خدمة للمعاينة</button>
  </section>
  <section className="card space-y-3"><h3 className="subsection-title">المخزون والاستهلاك والتنبيه عند النفاد</h3>
   <p className="txt-muted">عرض أولي لقائمة مواد وكميات. ربط المشتريات بتكلفة المخزون الفعلية غير جاهز بعد.</p>
   {stocks.map((s,i)=><div key={i} className="flex justify-between items-center border-b py-2 gap-2">
    <span>{s.name} — {s.qty} {s.unit}</span><strong className={s.qty<=s.min?"txt-warning":"txt-cash"}>{s.qty<=s.min?"الكمية منخفضة":"متوفر"}</strong>
    <button className="btn-secondary" onClick={()=>setStocks(v=>v.map((r,n)=>n===i?{...r,qty:Math.max(0,r.qty-1)}:r))}>استهلاك واحدة</button>
   </div>)}
   <label className="form-label">اسم المادة<input value={newStock} onChange={e=>setNewStock(e.target.value)} /></label>
   <label className="form-label">الكمية<input type="number" min="0" value={stockQty} onChange={e=>setStockQty(e.target.value)} /></label>
   <label className="form-label">الوحدة<select value={stockUnit} onChange={e=>setStockUnit(e.target.value)}>
    <option>قطعة</option><option>لتر</option><option>عبوة</option></select></label>
   <button className="btn-primary" onClick={()=>{
    const n=Number(stockQty);if(!newStock.trim()||!Number.isFinite(n)||n<0){alert("راجع الكمية والمادة.");return;}
    setStocks(v=>[...v,{name:newStock.trim(),qty:n,min:2,unit:stockUnit}]);setNewStock("");setStockQty("");
   }}>إضافة مادة للمعاينة</button>
  </section>
 </div>;

 return <div className="space-y-4">
  <section className="card space-y-3"><h2 className="section-title">إعدادات التنبيهات</h2>
   <p className="txt-muted">تنبيهات ارتفاع المصروفات وانخفاض المخزون مقارنة بحد المدير.</p>
   <label className="form-label">الحد اليومي للمصروفات بالريال
    <input type="number" min="0" value={threshold} placeholder={String(state.alertLimit)}
     onChange={e=>setThreshold(e.target.value)} /></label>
   <button className="btn-primary" onClick={()=>{
    const n=Number(threshold);if(!threshold||!Number.isFinite(n)||n<0){alert("أدخل رقمًا صحيحًا.");return;}
    change(d=>({...d,alertLimit:n}));setThreshold("");
   }}>حفظ الحد التجريبي</button>
  </section>
  <section className="card"><h3 className="subsection-title">التنبيهات الحالية</h3>
   {expenses.filter(e=>e.amount>state.alertLimit).map(e=><p className="border-b txt-warning py-3" key={e.id}>
    {e.day} · مصروف {e.type}: {money(e.amount)} تجاوز حد {money(state.alertLimit)}</p>)}
   {stocks.filter(s=>s.qty<=s.min).map(s=><p className="border-b txt-warning py-3" key={s.name}>
    مادة {s.name} اقتربت من النفاد ({s.qty} {s.unit})</p>)}
   <p className="txt-muted text-sm">الرسائل والتنبيهات الخارجية لا تُرسل في المعاينة.</p>
  </section>
 </div>;
}
