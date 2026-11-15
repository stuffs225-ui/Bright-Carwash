"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {showToast} from "@/lib/toast";
type Settings={
 worker_manual_service_enabled:boolean;
 fast_registration_recent_enabled:boolean;
 whatsapp_ready_text:string;
 ready_photo_retention_days:number;
};
const DEFAULT:Settings={
 worker_manual_service_enabled:true,
 fast_registration_recent_enabled:true,
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
  if(!Number.isInteger(policy.ready_photo_retention_days)||
    policy.ready_photo_retention_days<1||policy.ready_photo_retention_days>365||
    policy.whatsapp_ready_text.trim().length<15||policy.whatsapp_ready_text.length>350){
   setError("راجع أيام الاحتفاظ (1–365) ونص رسالة واتساب.");return;
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
  <h2 className="section-title">إعدادات التسجيل والجاهزية</h2>
  <p className="txt-muted text-sm">التعديل يؤثر على التسجيلات الجديدة فقط؛ الأسعار والفواتير السابقة تبقى محفوظة.</p>
  {error&&<p role="alert" className="txt-danger text-sm">{error}</p>}
  {loading?<p className="txt-muted">جارٍ تحميل السياسات...</p>:<>
   <label className="flex items-center justify-between gap-3">
    <span>السماح للعامل بسعر أو خدمة لمرة واحدة</span>
    <input type="checkbox" checked={policy.worker_manual_service_enabled}
      onChange={e=>setPolicy(p=>({...p,worker_manual_service_enabled:e.target.checked}))}/>
   </label>
   <label className="flex items-center justify-between gap-3">
    <span>تحديد آخر خدمة استخدمت لكل حجم سيارة تلقائيًا عند الاختيار</span>
    <input type="checkbox" checked={policy.fast_registration_recent_enabled}
     onChange={e=>setPolicy(p=>({...p,fast_registration_recent_enabled:e.target.checked}))}/>
   </label>
   <p className="txt-muted text-xs">يحفظ الجهاز آخر اختيار للخدمة فقط، دون نقل أسعار قديمة؛ السعر المعتمد يؤخذ دائمًا من القائمة الحالية ويمكن تغييره قبل الحفظ.</p>
   <label className="form-label">نص جاهزية السيارة (مشاركة واتساب)
    <textarea rows={3} maxLength={350} value={policy.whatsapp_ready_text}
     onChange={e=>setPolicy(p=>({...p,whatsapp_ready_text:e.target.value}))}/>
   </label>
   <label className="form-label">مدة الاحتفاظ المطلوبة بصور الجاهزية (أيام)
    <input type="number" min="1" max="365" step="1"
     value={policy.ready_photo_retention_days}
     onChange={e=>setPolicy(p=>({...p,ready_photo_retention_days:Number(e.target.value)}))}/>
   </label>
   <p className="txt-warning text-xs">تُراجع مدة الاحتفاظ يوميًا بعد نجاح إنشاء نسخة احتياطية مشفرة والتحقق منها. لا يُحذف أي ملف إذا فشلت عملية النسخ، ويظل سجل الحذف موثقًا.</p>
   <button type="button" className="btn-primary w-full" onClick={()=>void save()} disabled={busy}>
    {busy?"جارٍ الحفظ":"حفظ السياسات"}
   </button>
  </>}
 </section>;
}
