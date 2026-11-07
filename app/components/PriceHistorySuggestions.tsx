"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {createPreset,loadPresets} from "@/lib/presets";
import {showToast} from "@/lib/toast";
import type {EntryPreset} from "@/lib/types";
type Candidate={car_type:string;service_type:string;base_price:number;
 usage_count:number;last_used:string;is_approved:boolean};
const price=(n:number)=>new Intl.NumberFormat("ar-SA-u-nu-latn",{
 maximumFractionDigits:2}).format(n)+" ر.س";
export function PriceHistorySuggestions(){
 const [items,setItems]=useState<Candidate[]>([]);
 const [presets,setPresets]=useState<EntryPreset[]>([]);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [showAll,setShowAll]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);
  const [c,p]=await Promise.all([
   supabase.rpc("carwash_price_candidates",{p_limit:75}),
   loadPresets()
  ]);
  if(c.error)setError(c.error.message);else{setItems((c.data||[]) as Candidate[]);setError("");}
  setPresets(p);setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);
 const candidates=useMemo(()=>items.filter(x=>!presets.some(p=>
  p.car_type===x.car_type&&p.service_type===x.service_type&&
  Math.abs(Number(p.amount)-Number(x.base_price))<0.001)),[items,presets]);
 async function approve(row:Candidate){
  if(!confirm("هل تريد اعتماد "+row.service_type+" لــ"+row.car_type+
   " بسعر "+price(Number(row.base_price))+" ضمن القائمة الرسمية؟"))return;
  setBusy(row.car_type+"-"+row.service_type+"-"+row.base_price);
  const result=await createPreset({
   car_type:row.car_type,service_type:row.service_type,
   amount:Number(row.base_price),active:true,
   sort_order:Math.max(0,...presets.map(p=>Number(p.sort_order)||0))+1
  });
  setBusy("");
  if(result.error){setError(result.error.message);return;}
  showToast("تم اعتماد الخيار كسعر رسمي للتسجيلات القادمة.");
  void load();
 }
 return <section className="card space-y-3">
  <h2 className="section-title">الأسعار المتكررة في الأرشيف — للمراجعة</h2>
  <p className="txt-muted text-sm">هذه أسعار مسجلة سابقًا وليست تسعيرة معتمدة. اعتمد كل خيار يدويًا قبل ظهوره للعامل.</p>
  {error&&<p role="alert" className="txt-danger text-sm">{error}</p>}
  {loading?<p className="txt-muted text-sm">جارٍ احتساب التكرارات...</p>:
   candidates.length===0?<p className="txt-muted text-sm">لا توجد خيارات تاريخية إضافية للعرض.</p>:
   <div className="space-y-2">
    {candidates.slice(0,showAll?75:8).map(row=>{
     const key=row.car_type+"-"+row.service_type+"-"+row.base_price;
     return <div key={key} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border"
      style={{borderColor:"var(--border)"}}>
      <div className="min-w-0">
       <strong>{row.car_type} — {row.service_type} — {price(Number(row.base_price))}</strong>
       <p className="txt-muted text-xs">{Number(row.usage_count).toLocaleString("ar-SA-u-nu-latn")} عملية · آخر استخدام {new Date(row.last_used).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{timeZone:"Asia/Riyadh",day:"numeric",month:"long",year:"numeric"})}</p>
      </div>
      <button type="button" className="btn-secondary" disabled={!!busy}
       onClick={()=>void approve(row)}>{busy===key?"جارٍ الاعتماد":"اعتماد السعر"}</button>
     </div>;
    })}
    {candidates.length>8&&<button type="button" className="btn-secondary w-full"
     onClick={()=>setShowAll(x=>!x)}>{showAll?"إظهار الأكثر استخدامًا":"عرض الخيارات النادرة"}</button>}
   </div>}
 </section>;
}
