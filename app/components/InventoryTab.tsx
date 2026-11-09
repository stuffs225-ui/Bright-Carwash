"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "@/lib/supabaseClient";

type Item={
 id:string;name:string;unit:string;stock_qty:number;min_qty:number;
 avg_unit_cost:number;active:boolean;updated_at:string;
};
type Movement={
 id:string;item_id:string;kind:"purchase"|"use"|"adjust_in"|"adjust_out";
 quantity:number;total_cost:number;payment_source:string|null;
 note:string|null;occurred_at:string;expense_id:string|null;
};
type Payload={op:"move";itemId:string;kind:Movement["kind"];qty:number;
 total:number;source:string;note:string;requestId:string};
const units=["لتر","عبوة","قطعة","كرتون","كيلو","رول"];
const money=(x:number)=>new Intl.NumberFormat("ar-SA-u-nu-latn",{
 style:"currency",currency:"SAR",maximumFractionDigits:2}).format(x);
const qtyFormat=(n:number)=>new Intl.NumberFormat("ar-SA-u-nu-latn",{
 maximumFractionDigits:3}).format(n);
const actions:{id:Movement["kind"];label:string}[]=[
 {id:"purchase",label:"شراء وتوريد"},
 {id:"use",label:"استهلاك"},
 {id:"adjust_in",label:"زيادة رصيد"},
 {id:"adjust_out",label:"تسوية نقص"}
];
const inputClass="w-full rounded-xl border p-3 bg-transparent";
async function action(body:Record<string,unknown>){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw Error("جلسة الإدارة غير متاحة؛ افتح الإدارة من جديد");
 const response=await fetch("/api/inventory",{
  method:"POST",cache:"no-store",credentials:"same-origin",
  headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},
  body:JSON.stringify(body)
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||"فشل الطلب");
 return result;
}
export function InventoryTab(){
 const [items,setItems]=useState<Item[]>([]);
 const [movements,setMovements]=useState<Movement[]>([]);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [name,setName]=useState("");
 const [unit,setUnit]=useState("عبوة");
 const [minimum,setMinimum]=useState("0");
 const [selected,setSelected]=useState("");
 const [kind,setKind]=useState<Movement["kind"]>("purchase");
 const [quantity,setQuantity]=useState("");
 const [cost,setCost]=useState("");
 const [payment,setPayment]=useState("cash");
 const [note,setNote]=useState("");
 const pending=useRef<Payload|null>(null);
 const [unconfirmed,setUnconfirmed]=useState(false);
 const load=useCallback(async()=>{
  try{
   const response=await action({op:"list"});
   setItems(response.items||[]);
   setMovements(response.movements||[]);
   setSelected(old=>old||(response.items||[]).find((i:Item)=>i.active)?.id||"");
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل المخزون");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const active=useMemo(()=>items.filter(i=>i.active),[items]);
 const selectedItem=items.find(i=>i.id===selected);
 const low=items.filter(i=>i.active&&Number(i.stock_qty)<=Number(i.min_qty));
 const stockValue=items.filter(i=>i.active).reduce(
  (total,i)=>total+Number(i.stock_qty)*Number(i.avg_unit_cost),0);
 async function create(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  if(name.trim().length<2||!Number.isFinite(Number(minimum))||Number(minimum)<0){
   setError("تحقق من اسم المادة والحد الأدنى");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const result=await action({op:"create",name:name.trim(),unit,minQty:Number(minimum)});
   setName("");setMinimum("0");setSelected(result.id);setNotice("تم إضافة المادة. سجّل الكمية الحالية من حركة زيادة الرصيد أو الشراء.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"تعذر إضافة المادة");}
  finally{setBusy(false);}
 }
 async function setItem(item:Item,patch:Record<string,unknown>){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   await action({op:"update",id:item.id,name:item.name,minQty:Number(item.min_qty),
    active:item.active,...patch});
   setNotice("تم تحديث بيانات المادة");await load();
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحديث الصنف");}
  finally{setBusy(false);}
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  const n=Number(quantity),value=kind==="purchase"?Number(cost):0;
  if(!selectedItem||!Number.isFinite(n)||n<=0||n>100000||
   Math.abs(n*1000-Math.round(n*1000))>0.000001||
   !Number.isFinite(value)||value<0||
   Math.abs(value*100-Math.round(value*100))>0.000001){
   setError("راجع الكمية والمبلغ المدخلين");return;
  }
  if((kind==="adjust_in"||kind==="adjust_out")&&note.trim().length<3){
   setError("التسوية تحتاج سببًا واضحًا");return;
  }
  setBusy(true);setError("");setNotice("");
  const payload:Payload=pending.current||{
   op:"move",itemId:selected,kind,qty:n,total:value,source:payment,
   note:note.trim(),requestId:crypto.randomUUID()
  };
  pending.current=payload;
  try{
   const result=await action(payload);
   pending.current=null;setUnconfirmed(false);
   setNotice(result.duplicate?"الحركة سُجلت سابقًا؛ لم تتكرر":"تم حفظ الحركة"+(result.expenseId?" وربط مشتريات المواد بالمصروفات":""));
   setQuantity("");setCost("");setNote("");await load();
  }catch(e){
   // If a response was lost, do not assign a new request UUID:
   // the server may have already committed the stock and expense.
   setUnconfirmed(true);
   setError((e instanceof Error?e.message:"لم يتأكد وصول الحركة")+
    " — أعد المحاولة بنفس الزر، ولا تكرر شراءً جديدًا.");
  }finally{setBusy(false);}
 }
 function resetPending(){
  pending.current=null;setUnconfirmed(false);setError("");
  setQuantity("");setCost("");setNote("");
 }
 return <div className="space-y-4" dir="rtl">
  <header className="card space-y-2">
   <h2 className="section-title">مخزون المواد والاستهلاك</h2>
   <p className="txt-muted text-sm">
    شراء الصابون أو الواكس أو أي مادة يسجل مصروفًا واحدًا ويزيد رصيد المخزون.
    الاستهلاك ينقص الرصيد فقط ولا يضاعف المصروف. لا توجد كميات افتتاحية مفترضة.
   </p>
  </header>
  {error&&<div className="card txt-danger" role="alert">{error}</div>}
  {notice&&<div className="card" role="status">{notice}</div>}
  <div className="grid grid-cols-2 gap-3">
   <div className="metric-card tone-blue"><div className="metric-label">عدد المواد النشطة</div>
    <strong className="metric-value">{active.length}</strong></div>
   <div className="metric-card tone-amber"><div className="metric-label">مواد تحتاج توريدًا</div>
    <strong className="metric-value">{low.length}</strong></div>
  </div>
  <p className="text-sm txt-muted">قيمة المخزون التقديرية بسعر التكلفة المرجح: {money(stockValue)} — ليست ربحًا إضافيًا.</p>
  <form onSubmit={create} className="card space-y-3">
   <h3 className="font-bold">إضافة مادة جديدة</h3>
   <label className="block text-sm">اسم المادة
    <input className={inputClass} value={name} maxLength={100}
     onChange={e=>setName(e.target.value)} placeholder="مثال: صابون، واكس، مناشف"/>
   </label>
   <div className="grid grid-cols-2 gap-2">
    <label className="text-sm">الوحدة
     <select className={inputClass} value={unit} onChange={e=>setUnit(e.target.value)}>
      {units.map(u=><option key={u} value={u}>{u}</option>)}
     </select>
    </label>
    <label className="text-sm">حد التنبيه
     <input className={inputClass} type="number" min="0" step=".001"
      value={minimum} onChange={e=>setMinimum(e.target.value)}/>
    </label>
   </div>
   <button className="btn-secondary w-full" disabled={busy||!name.trim()} type="submit">
    إضافة المادة</button>
  </form>
  <form className="card space-y-3" onSubmit={submit}>
   <h3 className="font-bold">تسجيل حركة مخزون</h3>
   <label className="block text-sm">المادة
    <select className={inputClass} value={selected} disabled={busy||unconfirmed}
     onChange={e=>setSelected(e.target.value)}>
     <option value="">اختر مادة</option>
     {active.map(i=><option key={i.id} value={i.id}>{i.name} ({qtyFormat(Number(i.stock_qty))} {i.unit})</option>)}
    </select>
   </label>
   <div className="grid grid-cols-2 gap-2">
    {actions.map(a=><button key={a.id} type="button" disabled={busy||unconfirmed}
     className={kind===a.id?"btn-primary":"btn-secondary"}
     onClick={()=>{setKind(a.id);setCost("");setError("");}}>{a.label}</button>)}
   </div>
   <label className="block text-sm">الكمية {selectedItem?"("+selectedItem.unit+")":""}
    <input className={inputClass} type="number" inputMode="decimal" min=".001" step=".001"
     disabled={busy||unconfirmed} value={quantity} onChange={e=>setQuantity(e.target.value)}/>
   </label>
   {kind==="purchase"&&<div className="grid grid-cols-2 gap-2">
    <label className="block text-sm">تكلفة الشراء الكاملة (ر.س)
     <input className={inputClass} type="number" min="0" step=".01" inputMode="decimal"
      disabled={busy||unconfirmed} value={cost} onChange={e=>setCost(e.target.value)}/>
    </label>
    <label className="block text-sm">مصدر الدفع
     <select className={inputClass} disabled={busy||unconfirmed} value={payment}
      onChange={e=>setPayment(e.target.value)}>
      <option value="cash">كاش</option><option value="network">شبكة</option>
      <option value="bank">تحويل بنكي</option><option value="other">أخرى</option>
     </select>
    </label>
   </div>}
   <label className="block text-sm">السبب أو الملاحظة {kind.startsWith("adjust")?"(إلزامي)":""}
    <input className={inputClass} maxLength={300} disabled={busy||unconfirmed}
     value={note} onChange={e=>setNote(e.target.value)}
     placeholder={kind==="use"?"مثال: استخدام الوردية":kind==="purchase"?"مثال: فاتورة توريد":"سبب فرق الجرد"}/>
   </label>
   <button className="btn-primary w-full py-3" type="submit" disabled={busy||!selected}>
    {busy?"جارٍ الحفظ...":unconfirmed?"إعادة تأكيد نفس الحركة":"حفظ حركة المخزون"}
   </button>
   {unconfirmed&&<button type="button" className="btn-secondary w-full" onClick={resetPending}>
    إلغاء إعادة المحاولة (تحقق من السجل أولًا)
   </button>}
   {kind==="purchase"&&<p className="txt-muted text-xs">تسجل التكلفة المدفوعة ضمن المصروفات بمجرد اعتماد الحركة. لا تعِد تسجيل الفاتورة في المصروفات.</p>}
  </form>
  <section className="card space-y-3">
   <div className="flex justify-between items-center">
    <h3 className="font-bold">الأرصدة الحالية</h3>
    <button type="button" className="btn-secondary" disabled={loading} onClick={()=>void load()}>
     تحديث</button>
   </div>
   {loading&&<p className="txt-muted">تحميل المخزون...</p>}
   {!loading&&items.length===0&&<p className="txt-muted">لم تضاف مواد بعد.</p>}
   {items.map(i=><div className="border-b pb-3 space-y-2" key={i.id}>
    <div className="flex justify-between gap-2">
     <span className="font-bold">{i.name} {!i.active?"(موقوف)":""}</span>
     <span className={i.active&&Number(i.stock_qty)<=Number(i.min_qty)?"txt-danger":"txt-cash"}>
      {qtyFormat(Number(i.stock_qty))} {i.unit}
     </span>
    </div>
    <p className="txt-muted text-xs">التنبيه: {qtyFormat(Number(i.min_qty))} {i.unit} · تكلفة الوحدة التقديرية: {money(Number(i.avg_unit_cost))}</p>
    <div className="flex items-center gap-2">
     <label className="text-xs">حد التنبيه
      <input className="w-24 p-2 border rounded-lg bg-transparent" id={"limit-"+i.id}
       key={i.min_qty} defaultValue={i.min_qty} type="number" min="0" step=".001"/>
     </label>
     <button className="btn-secondary" type="button" disabled={busy} onClick={()=>{
      const field=document.getElementById("limit-"+i.id) as HTMLInputElement|null;
      const next=Number(field?.value);
      if(!Number.isFinite(next)||next<0){setError("حد التنبيه غير صحيح");return;}
      void setItem(i,{minQty:next});
     }}>حفظ الحد</button>
     <button className="btn-secondary" type="button" disabled={busy} onClick={()=>void setItem(i,{active:!i.active})}>
      {i.active?"إيقاف":"تفعيل"}
     </button>
    </div>
   </div>)}
  </section>
  <section className="card space-y-3">
   <h3 className="font-bold">آخر 100 حركة</h3>
   {movements.length===0&&<p className="txt-muted">لا توجد حركات بعد.</p>}
   {movements.map(m=><div key={m.id} className="border-b py-2">
    <div className="flex justify-between gap-2 text-sm">
     <span>{items.find(i=>i.id===m.item_id)?.name||"مادة"} · {actions.find(a=>a.id===m.kind)?.label}</span>
     <strong>{qtyFormat(Number(m.quantity))}</strong>
    </div>
    <p className="txt-muted text-xs">{new Date(m.occurred_at).toLocaleString("ar-SA-u-nu-latn",{timeZone:"Asia/Riyadh"})} · {money(Number(m.total_cost))}{m.expense_id?" · مصروف مرتبط":""}</p>
    {m.note&&<p className="text-xs">{m.note}</p>}
   </div>)}
  </section>
 </div>;
}
