"use client";
import {useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {normalizeSaudiMobile} from "@/lib/phone";
import {pinChangeIsValid} from "@/lib/carwashPinRules";
import {queueLength} from "@/lib/offlineQueue";
import type {AppIdentity} from "./AuthGate";

export function AccountSettings({identity}:{identity:AppIdentity}){
 const [oldPin,setOldPin]=useState("");
 const [newPin,setNewPin]=useState("");
 const [confirmPin,setConfirmPin]=useState("");
 const [newPhone,setNewPhone]=useState("");
 const [code,setCode]=useState("");
 const [stage,setStage]=useState<"new"|"verify">("new");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const isManager=identity.role==="manager";

 async function changePin(e:React.FormEvent){
  e.preventDefault();setError("");setMessage("");
  if(!pinChangeIsValid(oldPin,newPin)||newPin!==confirmPin){
   setError("أدخل الرمز القديم ورمزًا جديدًا مختلفًا من أربعة أرقام ومتطابقًا مع التأكيد.");return;
  }
  if(queueLength()>0){
   setError("زامن عمليات السيارات المحلية قبل تغيير الرمز وتسجيل الخروج.");return;
  }
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){setError("يجب الدخول أولًا.");return;}
  setBusy(true);
  try{
   const response=await fetch("/api/auth/pin/change",{
    method:"POST",headers:{"content-type":"application/json",
     authorization:"Bearer "+session.access_token},
    body:JSON.stringify({oldPin,newPin}),cache:"no-store",
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"لم يتم تغيير الرمز");
   setOldPin("");setNewPin("");setConfirmPin("");
   setMessage("تغيّر الرمز. سيتم تسجيل الخروج من هذا الجهاز، ثم ادخل بالرمز الجديد.");
   await supabase.auth.signOut({scope:"global"});
  }catch(e){setError(e instanceof Error?e.message:"تعذّر تغيير الرمز");}
  finally{setBusy(false);}
 }
 async function requestPhoneChange(e:React.FormEvent){
  e.preventDefault();setError("");setMessage("");
  if(!isManager){
   setError("حساب العامل مشترك؛ المدير فقط يغيّر رقم هاتفه حتى لا يفقد باقي العمال الوصول.");return;
  }
  if(queueLength()>0){setError("زامن العمليات المعلقة أولًا.");return;}
  const normalized=normalizeSaudiMobile(newPhone);
  if(!normalized){setError("أدخل رقم جوال سعوديًا صحيحًا.");return;}
  if(normalized===identity.email){setError("هذا هو الرقم الحالي بالفعل.");return;}
  setBusy(true);
  const {error}=await supabase.auth.updateUser({phone:normalized});
  setBusy(false);
  if(error){setError("لم يكتمل إرسال رمز تأكيد الجوال الجديد. يلزم تفعيل مزود SMS: "+error.message);return;}
  setNewPhone(normalized);setStage("verify");
  setMessage("تحقق من الجوال الجديد، ثم أدخل رمز التحقق الذي أُرسل إليه.");
 }
 async function verifyPhone(e:React.FormEvent){
  e.preventDefault();setError("");setMessage("");
  const normalized=normalizeSaudiMobile(newPhone);
  if(!normalized||!/^\d{6}$/.test(code)){setError("أدخل رمز التأكيد من 6 أرقام.");return;}
  setBusy(true);
  const {error}=await supabase.auth.verifyOtp({phone:normalized,token:code,type:"phone_change"});
  setBusy(false);
  if(error){setError("تعذر تأكيد الجوال الجديد؛ راجع الرمز أو رقم الهاتف.");return;}
  setCode("");setStage("new");setNewPhone("");
  setMessage("تم توثيق رقم الجوال الجديد. رمز الدخول ذو الأربعة أرقام لم يتغيّر.");
 }
 return <div className="space-y-4" dir="rtl">
  <section className="card">
   <h2 className="section-title">معلومات الحساب</h2>
   <p><strong>نوع الحساب:</strong> {isManager?"مدير المغسلة":"حساب العمال المشترك"}</p>
   <p><strong>رقم الجوال الحالي:</strong> {identity.email}</p>
   <p className="txt-muted text-sm">يبقى الحساب مسجّلًا على الجهاز أثناء صلاحية الجلسة. لا يظهر رقم PIN المحفوظ لأحد.</p>
  </section>
  <section className="card space-y-3">
   <h3 className="subsection-title">تغيير رمز الدخول (4 أرقام)</h3>
   <form onSubmit={changePin} className="space-y-3">
    <label className="form-label">الرمز الحالي<input type="password" inputMode="numeric"
     autoComplete="current-password" maxLength={4} pattern="[0-9]{4}" required
     value={oldPin} onChange={e=>setOldPin(e.target.value.replace(/\D/g,"").slice(0,4))}/></label>
    <label className="form-label">الرمز الجديد<input type="password" inputMode="numeric"
     autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" required
     value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,"").slice(0,4))}/></label>
    <label className="form-label">تأكيد الرمز الجديد<input type="password" inputMode="numeric"
     autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" required
     value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,"").slice(0,4))}/></label>
    <button className="btn-primary w-full" type="submit" disabled={busy}>حفظ رمز الدخول الجديد</button>
   </form>
  </section>
  <section className="card space-y-3">
   <h3 className="subsection-title">تغيير رقم جوال الحساب</h3>
   {isManager?<form className="space-y-3" onSubmit={stage==="new"?requestPhoneChange:verifyPhone}>
    <p className="txt-muted text-sm">تغيير الرقم يتطلب تأكيد ملكية الجوال الجديد برمز SMS، وليس مجرد إدخال رقم آخر.</p>
    <label className="form-label">الجوال الجديد<input type="tel" required value={newPhone}
     disabled={stage==="verify"} onChange={e=>setNewPhone(e.target.value)} placeholder="05XXXXXXXX"/></label>
    {stage==="verify"&&<label className="form-label">رمز التحقق (6 أرقام)
     <input type="text" inputMode="numeric" autoComplete="one-time-code"
       pattern="[0-9]{6}" maxLength={6} required value={code}
       onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}/>
    </label>}
    <button type="submit" className="btn-secondary w-full" disabled={busy}>
     {stage==="verify"?"تأكيد الجوال الجديد":"إرسال رمز تحقق إلى الجوال الجديد"}
    </button>
   </form>:<p className="txt-warning text-sm">
     رقم العامل مشترك بين كل العمال؛ تغييره يحتاج إجراءً من المدير حتى لا تنقطع أجهزة الفريق.
    </p>}
  </section>
  {error&&<p role="alert" className="txt-danger card">{error}</p>}
  {message&&<p role="status" className="card">{message}</p>}
 </div>;
}
