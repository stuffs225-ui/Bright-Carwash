"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {showToast} from "@/lib/toast";
type Settings={
 worker_manual_service_enabled:boolean;
 worker_manual_addon_enabled:boolean;
 worker_discount_max:number;
 whatsapp_ready_text:string;
 ready_photo_retention_days:number;
};
const DEFAULT:Settings={
 worker_manual_service_enabled:true,worker_manual_addon_enabled:true,worker_discount_max:10,
 whatsapp_ready_text:"مرحبًا، سيارتك جاهزة للاستلام من مغسلة سيارتك اللامعة. شكرًا لزيارتك ونتشرف بخدمتك دائمًا.",
 ready_photo_retention_days:30
};
export function CarwashPolicySettings(){
 const [policy,setPolicy]=useState<Settings>(DEFAULT);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  supabase.from("settings").select("key,value").in("key",Object.keys(DEFAULT)).then(({data,error})=>{
   if(!active)return;
   if(error){setError("تعذر قراءة السياسات: "+error.message);setLoading(false);return;}
   const next={...DEFAULT} as Record<string,string|number|boolean>;
   for(const row of data||[]){
    const k=row.key as keyof Settings;
    if(k in DEFAULT){
     const fallback=DEFAULT[k];
     next[k]=typeof fallback==="boolean"?row.value===true:
      typeof fallback==="number"?Number(row.value):String(row.value);
    }
   }
   setPolicy(next as Settings);setLoading(false);
  });
  return()=>{active=false;};
 },[]);
 async function save(){
  if(!Number.isFinite(policy.worker_discount_max)||policy.worker_discount_max<0||
    policy.worker_discount_max>1000||!Number.isInteger(policy.ready_photo_retention_days)||
    policy.ready_photo_retention_days<1||policy.ready_photo_retention_days>365||
    policy.whatsapp_ready_text.trim().length<15||policy.whatsapp_ready_text.length>350){
   setError("راجع حد الخصم (0–1000)، أيام الاحتفاظ (1–365)، ونص رسالة واتساب.");return;
  }
  setBusy(true);setError("");
  try{
   for(const [key,value] of Object.entries(policy)){
    const {error}=await supabase.from("settings").upsert({key,value},{onConflict:"key"});
    if(error)throw Error(error.message);
   }
   showToast("تم حفظ سياسة الأسعار والجاهزية.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ الإعدادات");}
  finally{setBusy(false);}
 }
 return <section className="card space-y-3">
  <h2 className="section-title">سياسات السعر والجاهزية</h2>
  <p className="txt-muted text-sm">التعديل يؤثر على التسجيلات الجديدة فقط؛ الأسعار والفواتير السابقة تبقى محفوظة.</p>
  {error&&<p role="alert" className="txt-danger text-sm">{error}</p>}
  {loading?<p className="txt-muted">جارٍ تحميل السياسات...</p>:<>
   <label className="flex items-center justify-between gap-3">
    <span>السماح للعامل بسعر أو خدمة لمرة واحدة</span>
    <input type="checkbox" checked={policy.worker_manual_service_enabled}
      onChange={e=>setPolicy(p=>({...p,worker_manual_service_enabled:e.target.checked}))}/>
   </label>
   <label className="flex items-center justify-between gap-3">
    <span>السماح بإضافة استثنائية لمرة واحدة</span>
    <input type="checkbox" checked={policy.worker_manual_addon_enabled}
      onChange={e=>setPolicy(p=>({...p,worker_manual_addon_enabled:e.target.checked}))}/>
   </label>
   <label className="form-label">الحد الأعلى للخصم لكل سيارة (ر.س)
    <input type="number" min="0" max="1000" step="0.01" inputMode="decimal"
     value={policy.worker_discount_max}
     onChange={e=>setPolicy(p=>({...p,worker_discount_max:Number(e.target.value)}))}/>
   </label>
   <label className="form-label">نص جاهزية السيارة (مشاركة واتساب)
    <textarea rows={3} maxLength={350} value={policy.whatsapp_ready_text}
     onChange={e=>setPolicy(p=>({...p,whatsapp_ready_text:e.target.value}))}/>
   </label>
   <label className="form-label">مدة الاحتفاظ المطلوبة بصور الجاهزية (أيام)
    <input type="number" min="1" max="365" step="1"
     value={policy.ready_photo_retention_days}
     onChange={e=>setPolicy(p=>({...p,ready_photo_retention_days:Number(e.target.value)}))}/>
   </label>
   <p className="txt-warning text-xs">تحديد مدة الاحتفاظ يسجل السياسة، لكنه لا يثبت تنفيذ الحذف الآلي حتى تتوفر مهمة احتفاظ مجدولة ونتيجة تحقق.</p>
   <button type="button" className="btn-primary w-full" onClick={()=>void save()} disabled={busy}>
    {busy?"جارٍ الحفظ":"حفظ السياسات"}
   </button>
  </>}
 </section>;
}
