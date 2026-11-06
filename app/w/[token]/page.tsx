"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {normalizeSaudiMobile} from "@/lib/phone";

type Preset={id:string;car_type:string;service_type:string;amount:number};
type Addon={id:string;name:string;price:number};
type Catalog={label:string;presets:Preset[];addons:Addon[]};
const sar=(value:number)=>new Intl.NumberFormat("ar-SA",{maximumFractionDigits:2,minimumFractionDigits:2}).format(value)+" ر.س";
const rounded=(n:number)=>Math.round(n*100)/100;

export default function WorkerLinkPage({params}:{params:{token:string}}){
 const token=params.token||"";
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [invalid,setInvalid]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [presetId,setPresetId]=useState("");
 const [selectedAddons,setSelectedAddons]=useState<string[]>([]);
 const [method,setMethod]=useState<"cash"|"card"|"mixed">("cash");
 const [discount,setDiscount]=useState("0");
 const [cash,setCash]=useState("");
 const [card,setCard]=useState("");
 const [customerPhone,setCustomerPhone]=useState("");
 const [consent,setConsent]=useState(false);
 const [notes,setNotes]=useState("");
 const [status,setStatus]=useState("");
 const [error,setError]=useState("");
 const mutationId=useRef<string|null>(null);

 useEffect(()=>{
  let cancelled=false;
  async function load(){
   setLoading(true);
   try{
    const res=await fetch("/api/worker-links/catalog",{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({token}),cache:"no-store"
    });
    const info=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(info.error||"الرابط غير صالح");
    if(!cancelled){
     setCatalog(info);
     if(info.presets?.length)setPresetId(info.presets[0].id);
    }
   }catch(e){if(!cancelled)setInvalid(e instanceof Error?e.message:"تعذر فتح الرابط");}
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[token]);

 const preset=catalog?.presets.find(p=>p.id===presetId);
 const totalAddons=useMemo(()=>(catalog?.addons||[])
  .filter(a=>selectedAddons.includes(a.id)).reduce((v,a)=>v+Number(a.price),0),
 [catalog,selectedAddons]);
 const discountNumber=Number(discount)||0;
 const price=rounded(Number(preset?.amount||0)+totalAddons-discountNumber);
 useEffect(()=>{
  if(!preset)return;
  if(method==="cash"){setCash(String(price));setCard("0");}
  else if(method==="card"){setCash("0");setCard(String(price));}
  else{
   const half=rounded(price/2);
   setCash(String(half));setCard(String(rounded(price-half)));
  }
 },[price,method,presetId]);

 async function submit(e:React.FormEvent){
  e.preventDefault();setError("");setStatus("");
  if(!catalog||!preset)return;
  const c=Number(cash),d=Number(card),discountValue=Number(discount);
  if(!Number.isFinite(c)||!Number.isFinite(d)||c<0||d<0||
     !Number.isFinite(discountValue)||discountValue<0||discountValue>10||
     rounded(c+d)!==price){
   setError("راجع مبلغ الكاش والشبكة والخصم؛ مجموع الدفع يجب أن يطابق السعر النهائي.");return;
  }
  const phone=customerPhone.trim()?normalizeSaudiMobile(customerPhone):null;
  if(customerPhone.trim()&&!phone){setError("رقم جوال العميل غير صحيح. يمكنك تركه فارغًا.");return;}
  if(phone&&!consent){setError("يجب تأكيد موافقة العميل قبل استخدام جواله لواتساب، أو اترك الرقم فارغًا.");return;}
  if(!mutationId.current)mutationId.current=crypto.randomUUID();
  setBusy(true);
  try{
   const response=await fetch("/api/worker-links/record",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({token,presetId,addons:selectedAddons,cash:c,card:d,
      discount:discountValue,notes,customerPhone:phone,
      whatsappConsent:!!phone&&consent,mutationId:mutationId.current}),cache:"no-store"
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"تعذر حفظ السيارة");
   mutationId.current=null;
   setStatus("تم تسجيل السيارة بنجاح. يمكنك إضافة سيارة أخرى.");
   setNotes("");setSelectedAddons([]);setDiscount("0");
   setCustomerPhone("");setConsent(false);setMethod("cash");
   window.scrollTo({top:0,behavior:"smooth"});
  }catch(e){
   setError(e instanceof Error?e.message:"تعذر تسجيل السيارة. حاول مرة أخرى بنفس البيانات.");
  }finally{setBusy(false);}
 }
 return <main className="min-h-screen px-4 py-6 max-w-xl mx-auto space-y-4" dir="rtl">
  <header className="card text-center space-y-2">
   <h1 className="section-title">🚗 تسجيل السيارات</h1>
   <p className="txt-muted text-sm">مغسلة سيارتك اللامعة</p>
   {catalog&&<p className="text-sm font-bold">{catalog.label}</p>}
  </header>
  {loading?<section className="card text-center">جارٍ فتح نموذج تسجيل السيارات...</section>:
   invalid?<section className="card"><p className="txt-danger">{invalid}</p>
    <p className="txt-muted text-sm mt-2">اطلب رابطًا جديدًا من مدير المغسلة.</p></section>:
  <form onSubmit={submit} className="card space-y-4">
   {status&&<p className="rounded-lg bg-green-100 text-green-900 p-3 text-sm" role="status">{status}</p>}
   {error&&<p className="txt-danger text-sm" role="alert">{error}</p>}
   <label className="form-label">نوع السيارة والخدمة
    <select value={presetId} onChange={e=>{setPresetId(e.target.value);mutationId.current=null;}} required>
     {(catalog?.presets||[]).map(p=><option key={p.id} value={p.id}>{p.car_type} — {p.service_type} ({sar(Number(p.amount))})</option>)}
    </select>
   </label>
   {(catalog?.addons.length||0)>0&&<div className="space-y-2">
    <p className="form-label">خدمات إضافية (اختياري)</p>
    {catalog?.addons.map(a=><label key={a.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
     <span><input type="checkbox" checked={selectedAddons.includes(a.id)}
      onChange={e=>setSelectedAddons(v=>e.target.checked?[...v,a.id]:v.filter(z=>z!==a.id))}/> {a.name}</span>
     <span>{sar(Number(a.price))}</span>
    </label>)}
   </div>}
   <label className="form-label">الخصم (من 0 إلى 10 ريالات)
    <input type="number" inputMode="decimal" min="0" max="10" step=".01"
     value={discount} onChange={e=>setDiscount(e.target.value)} required/>
   </label>
   <div className="space-y-2">
    <p className="form-label">طريقة الدفع</p>
    <div className="grid grid-cols-3 gap-2">
     {(["cash","card","mixed"] as const).map(x=>
      <button type="button" key={x} className={method===x?"btn-primary":"btn-secondary"}
       onClick={()=>setMethod(x)}>{x==="cash"?"كاش":x==="card"?"شبكة":"مختلط"}</button>)}
    </div>
   </div>
   {method==="mixed"&&<div className="grid grid-cols-2 gap-3">
    <label className="form-label">المبلغ كاش
     <input type="number" inputMode="decimal" min="0" step=".01" value={cash}
      onChange={e=>setCash(e.target.value)}/>
    </label>
    <label className="form-label">المبلغ شبكة
     <input type="number" inputMode="decimal" min="0" step=".01" value={card}
      onChange={e=>setCard(e.target.value)}/>
    </label>
   </div>}
   <div className="rounded-xl p-3 bg-slate-100 text-slate-900 flex items-center justify-between">
    <span>الإجمالي بعد الخصم</span><strong className="text-xl">{sar(Math.max(0,price))}</strong>
   </div>
   <details className="border rounded-lg p-3">
    <summary className="cursor-pointer font-semibold">معلومات إضافية (اختيارية)</summary>
    <div className="space-y-3 pt-3">
     <label className="form-label">ملاحظات
      <input type="text" maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}
       placeholder="ملاحظات عن السيارة"/>
     </label>
     <label className="form-label">رقم جوال العميل (اختياري — للجاهزية فقط)
      <input type="tel" inputMode="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}
       placeholder="05XXXXXXXX"/>
     </label>
     {customerPhone&&<label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
      <span>وافق العميل على استخدام رقمه لاستلام إشعار جاهزية واتساب.</span>
     </label>}
    </div>
   </details>
   <button className="btn-primary w-full py-4 text-lg" type="submit" disabled={busy||!preset}>
    {busy?"جارٍ تسجيل السيارة...":"تسجيل السيارة"}
   </button>
   <p className="txt-muted text-xs text-center">لا يحتاج هذا الرابط إيميل أو حساب أو كلمة مرور. يتيح تسجيل السيارات فقط. يجب توفر الإنترنت وقت الحفظ.</p>
  </form>}
 </main>;
}
