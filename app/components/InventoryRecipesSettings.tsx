"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "@/lib/supabaseClient";

type Material={id:string;name:string;unit:string;stock_qty:number;inventory_value:number;active:boolean};
type Preset={car_type:string;service_type:string;sort_order:number};
type Recipe={id:string;car_type:string;service_type:string;item_id:string;quantity:number;active:boolean;physical_count_confirmed_at:string|null};
const qty=(v:number)=>new Intl.NumberFormat("ar-SA-u-nu-latn",{maximumFractionDigits:3}).format(v);
async function inventoryRequest(body:Record<string,unknown>){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw Error("جلسة المدير غير متاحة");
 const response=await fetch("/api/inventory",{
  method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},
  credentials:"same-origin",cache:"no-store",body:JSON.stringify(body)
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||"تعذر تحديث استهلاك المواد");
 return data;
}
export function InventoryRecipesSettings(){
 const [items,setItems]=useState<Material[]>([]);
 const [presets,setPresets]=useState<Preset[]>([]);
 const [recipes,setRecipes]=useState<Recipe[]>([]);
 const [accountingReady,setAccountingReady]=useState(false);
 const [enabled,setEnabled]=useState(false);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [car,setCar]=useState("");
 const [service,setService]=useState("");
 const [item,setItem]=useState("");
 const [amount,setAmount]=useState("");
 const [activate,setActivate]=useState(false);
 const [countConfirmed,setCountConfirmed]=useState(false);
 const editor=useRef<HTMLFormElement>(null);
 const load=useCallback(async()=>{
  try{
   const data=await inventoryRequest({op:"list"});
   setItems(data.items||[]);
   setPresets(data.presets||[]);
   setRecipes(data.recipes||[]);
   setAccountingReady(data.accountingReady===true);
   setEnabled(data.autoEnabled===true);
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الوصفات");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const options=useMemo(()=>{
  const map=new Map<string,Preset>();
  for(const p of presets)map.set(p.car_type+"\u0000"+p.service_type,p);
  return [...map.values()];
 },[presets]);
 const carTypes=useMemo(()=>[...new Set(options.map(p=>p.car_type))],[options]);
 const services=options.filter(p=>p.car_type===car);
 const usedPairs=new Set(recipes.filter(r=>r.active).map(r=>r.car_type+"\u0000"+r.service_type));
 const uncovered=options.filter(p=>!usedPairs.has(p.car_type+"\u0000"+p.service_type));
 const activeRecipes=recipes.filter(r=>r.active);
 async function save(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  const n=Number(amount);
  if(!car||!service||!item||!Number.isFinite(n)||n<=0||n>100000||
   Math.abs(n*1000-Math.round(n*1000))>0.000001){
   setError("حدد السيارة والخدمة والمادة وكمية صحيحة بحد أقصى 3 منازل عشرية.");
   return;
  }
  if(activate&&!countConfirmed){
   setError("للتفعيل يجب تأكيد الجرد الفعلي للمادة.");
   return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   await inventoryRequest({op:"recipe_upsert",carType:car,service,itemId:item,quantity:n,
    active:activate,confirmedPhysicalCount:countConfirmed});
   setNotice(activate?"حُفظت وصفة الاستهلاك وأصبحت جاهزة للتسجيلات الجديدة عند تفعيل الأتمتة.":"تم حفظ الوصفة معطلة حتى تؤكد الجرد الفعلي.");
   setAmount("");setCountConfirmed(false);setActivate(false);
   await load();
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ الوصفة");}
  finally{setBusy(false);}
 }
 async function toggle(next:boolean){
  if(busy)return;
  if(next&&!countConfirmed){
   setError("يجب تأكيد الجرد الفعلي قبل تشغيل الأتمتة.");return;
  }
  if(next&&!window.confirm("تفعيل الخصم الآلي للوصفات النشطة فقط؟ عمليات السيارات الجديدة ستخصم المواد داخل نفس معاملة التسجيل، وقد يتوقف حفظ خدمة إذا نفدت مادتها."))
   return;
  setBusy(true);setError("");setNotice("");
  try{
   await inventoryRequest({op:"auto_toggle",enabled:next,confirmedPhysicalCount:countConfirmed});
   setEnabled(next);setCountConfirmed(false);
   setNotice(next?"تُخصم المواد للوصفات النشطة في تسجيلات السيارات الجديدة فقط.":"تم إيقاف الخصم الآلي. لا تتأثر سجلات الاستهلاك السابقة.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"تعذر تغيير حالة الأتمتة");}
  finally{setBusy(false);}
 }
 function edit(r:Recipe){
  setCar(r.car_type);setService(r.service_type);setItem(r.item_id);
  setAmount(String(r.quantity));setActivate(r.active);setCountConfirmed(false);
  editor.current?.scrollIntoView({behavior:"smooth",block:"start"});
 }
 return <details className="card space-y-3" data-testid="inventory-recipes-settings">
  <summary className="cursor-pointer font-bold">الاستهلاك الآلي حسب نوع السيارة والخدمة</summary>
  <div className="space-y-3 mt-3">
   <p className="txt-muted text-xs">
    لا يُفعّل إلا بعد جرد المواد الحقيقية وتسجيل قيمتها. أي وصفة جديدة تطبّق على السيارات الجديدة فقط؛
    لا تُعدّل السيارات القديمة. الشراء أصل مخزون، ويُسجّل المصروف عند الاستهلاك مرة واحدة.
   </p>
   {error&&<p role="alert" className="txt-danger text-sm">{error}</p>}
   {notice&&<p role="status" className="txt-cash text-sm">{notice}</p>}
   {loading?<p className="txt-muted text-sm">جارٍ تحميل الوصفات...</p>:<>
    <div className="grid grid-cols-2 gap-2">
     <div className="rounded-xl border p-3">
      <span className="txt-muted text-xs block">وصفات المواد النشطة</span><strong>{activeRecipes.length}</strong>
     </div>
     <div className="rounded-xl border p-3">
      <span className="txt-muted text-xs block">خدمات دون وصفة مفعّلة</span>
      <strong className={uncovered.length?"txt-warning":""}>{uncovered.length}</strong>
     </div>
    </div>
    {uncovered.length>0&&<p className="txt-warning text-xs">
     الخدمات التي لم تُجهَّز لها وصفة ستظل دون خصم آلي. أكمل إعدادها قبل الاعتماد التشغيلي الشامل.
    </p>}
    <div className="rounded-xl border p-3 space-y-2" style={{borderColor:"var(--border)"}}>
     <strong className={enabled?"txt-cash":"txt-muted"}>
      {enabled?"✓ الاستهلاك الآلي مفعل للوصفات الجاهزة":"الاستهلاك الآلي متوقف"}
     </strong>
     {!enabled&&<label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={countConfirmed}
       onChange={e=>setCountConfirmed(e.target.checked)}/>
      أؤكد تسجيل الكميات الفعلية وتكاليف المواد من الجرد، وليس أرقامًا تقديرية
     </label>}
     <button type="button" className={enabled?"btn-secondary w-full":"btn-primary w-full"}
      disabled={busy||!accountingReady||(!enabled&&(!countConfirmed||activeRecipes.length===0))}
      onClick={()=>void toggle(!enabled)}>
      {busy?"جارٍ التحديث":enabled?"إيقاف الخصم الآلي":"تفعيل الخصم الآلي للوصفات النشطة"}
     </button>
    </div>
    <form ref={editor} className="space-y-3 border rounded-xl p-3 scroll-mt-24"
     onSubmit={e=>void save(e)} style={{borderColor:"var(--border)"}}>
     <h3 className="font-semibold">إضافة أو تعديل وصفة مادة</h3>
     <label className="form-label">نوع السيارة
      <select value={car} onChange={e=>{setCar(e.target.value);setService("");}}>
       <option value="">اختر نوع السيارة</option>
       {carTypes.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
     </label>
     <label className="form-label">الخدمة
      <select value={service} onChange={e=>setService(e.target.value)} disabled={!car}>
       <option value="">اختر الخدمة</option>
       {services.map(x=><option key={x.service_type} value={x.service_type}>{x.service_type}</option>)}
      </select>
     </label>
     <label className="form-label">المادة
      <select value={item} onChange={e=>setItem(e.target.value)}>
       <option value="">اختر مادة من المخزون</option>
       {items.filter(i=>i.active).map(i=><option key={i.id} value={i.id}>
        {i.name} — {qty(Number(i.stock_qty))} {i.unit}
       </option>)}
      </select>
     </label>
     <label className="form-label">الكمية المستخدمة لكل سيارة (بوحدة المادة المختارة)
      <input type="number" min=".001" max="100000" step=".001" inputMode="decimal"
       value={amount} onChange={e=>setAmount(e.target.value)}/>
     </label>
     <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={activate} onChange={e=>setActivate(e.target.checked)}/>
      الوصفة نشطة وتُستخدم في السيارات الجديدة عند تشغيل الأتمتة
     </label>
     {activate&&<label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={countConfirmed}
       onChange={e=>setCountConfirmed(e.target.checked)}/>
      تأكدت من جرد هذه المادة وإثبات كمية وتكلفة حقيقيتين
     </label>}
     <button className="btn-secondary w-full" type="submit" disabled={busy||!car||!service||!item||!amount}>
      {busy?"جارٍ الحفظ":"حفظ وصفة الاستهلاك"}
     </button>
    </form>
    <details className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
     <summary className="cursor-pointer font-semibold">الوصفات المحفوظة ({recipes.length})</summary>
     <div className="mt-3 space-y-2">
      {recipes.length===0?<p className="txt-muted text-sm">لم تُضف وصفات مواد بعد.</p>:
       recipes.map(r=><div className="border-b py-2 flex justify-between gap-2 items-center" key={r.id}>
        <div className="min-w-0">
         <strong className="block text-sm">{r.car_type} · {r.service_type}</strong>
         <span className="txt-muted text-xs">{items.find(i=>i.id===r.item_id)?.name||"مادة"} ·
          {" "+qty(Number(r.quantity))+" "+(items.find(i=>i.id===r.item_id)?.unit||"")}
          {" · "+(r.active?"نشطة":"معطلة")}
         </span>
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={()=>edit(r)}>تعديل</button>
       </div>)}
     </div>
    </details>
   </>}
  </div>
 </details>;
}
