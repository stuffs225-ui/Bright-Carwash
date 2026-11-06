"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {pinChangeIsValid} from "@/lib/carwashPinRules";
import {queueLength} from "@/lib/offlineQueue";
import type {AppIdentity} from "./AuthGate";

export function AccountSettings({identity}:{identity:AppIdentity}){
 const [status,setStatus]=useState<{email:string;configured:boolean;active:boolean}|null>(null);
 const [oldPin,setOldPin]=useState("");
 const [newPin,setNewPin]=useState("");
 const [confirmPin,setConfirmPin]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 useEffect(()=>{
  let mounted=true;
  async function load(){
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)return;
   const res=await fetch("/api/auth/pin/status",{
    headers:{authorization:"Bearer "+session.access_token},cache:"no-store"
   });
   const data=await res.json().catch(()=>null);
   if(mounted&&res.ok)setStatus(data);
   else if(mounted)setError("تعذر التحقق من إعدادات الحساب.");
  }
  void load();return()=>{mounted=false;};
 },[identity.userId]);

 async function changePin(e:React.FormEvent){
  e.preventDefault();setError("");setMessage("");
  if(!pinChangeIsValid(oldPin,newPin)||newPin!==confirmPin){
   setError("أدخل PIN الحالي ورمزًا جديدًا مختلفًا من 4 أرقام، وأكد الرمز الجديد.");return;
  }
  if(queueLength()>0){setError("زامن العمليات المعلقة قبل تغيير رمز الدخول.");return;}
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){setError("انتهت جلسة تسجيل الدخول.");return;}
  setBusy(true);
  try{
   const res=await fetch("/api/auth/pin/change",{
    method:"POST",headers:{"content-type":"application/json",
     authorization:"Bearer "+session.access_token},
    body:JSON.stringify({oldPin,newPin}),cache:"no-store"
   });
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(data.error||"لم يتم تغيير PIN");
   setOldPin("");setNewPin("");setConfirmPin("");
   await supabase.auth.signOut({scope:"local"});
  }catch(e){setError(e instanceof Error?e.message:"تعذر تغيير رمز PIN");}
  finally{setBusy(false);}
 }
 async function recoverPin(){
  setError("");setMessage("");setBusy(true);
  try{
   const email=status?.email||identity.email;
   const {error}=await supabase.auth.signInWithOtp({
    email,options:{shouldCreateUser:false,
     emailRedirectTo:window.location.origin+"/?reset=1"}
   });
   if(error)throw error;
   setMessage("تم طلب رسالة استعادة PIN. افتح رابط التحقق في بريدك، ثم اختر أربعة أرقام جديدة.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إرسال رسالة الاستعادة");}
  finally{setBusy(false);}
 }

 return <div className="space-y-4" dir="rtl">
  <section className="card space-y-2">
   <h2 className="section-title">معلومات الحساب</h2>
   <p><strong>نوع الحساب:</strong> {identity.role==="manager"?"مدير":"عامل"}</p>
   <p><strong>الإيميل:</strong> {status?.email||identity.email}</p>
   <p><strong>حالة الحساب:</strong> {status===null?"جارٍ التحقق...":status.active?"نشط":"متوقف"}</p>
   <p><strong>رمز PIN:</strong> {status===null?"جارٍ التحقق...":status.configured?"مفعل":"غير مفعل"}</p>
   <p className="txt-muted text-sm">تسجيل الدخول للإدارة والعامل بالإيميل وPIN فقط؛ لا يلزم رقم جوال.</p>
  </section>
  <section className="card space-y-3">
   <h3 className="subsection-title">تغيير رمز PIN (4 أرقام)</h3>
   <form onSubmit={changePin} className="space-y-3">
    <label className="form-label">رمز PIN الحالي
     <input type="password" inputMode="numeric" autoComplete="current-password"
      maxLength={4} pattern="[0-9]{4}" required value={oldPin}
      onChange={e=>setOldPin(e.target.value.replace(/\D/g,"").slice(0,4))}/>
    </label>
    <label className="form-label">رمز PIN الجديد
     <input type="password" inputMode="numeric" autoComplete="new-password"
      maxLength={4} pattern="[0-9]{4}" required value={newPin}
      onChange={e=>setNewPin(e.target.value.replace(/\D/g,"").slice(0,4))}/>
    </label>
    <label className="form-label">تأكيد PIN الجديد
     <input type="password" inputMode="numeric" autoComplete="new-password"
      maxLength={4} pattern="[0-9]{4}" required value={confirmPin}
      onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,"").slice(0,4))}/>
    </label>
    <button type="submit" className="btn-primary w-full" disabled={busy}>
     {busy?"جارٍ الحفظ...":"حفظ PIN الجديد"}
    </button>
   </form>
  </section>
  <section className="card space-y-3">
   <h3 className="subsection-title">نسيت PIN؟</h3>
   <p className="txt-muted text-sm">يمكنك استعادة الرمز بعد إثبات ملكية الإيميل. لن تحتاج إلى كلمة المرور القديمة أو رقم جوال.</p>
   <button type="button" className="btn-secondary w-full" onClick={()=>void recoverPin()} disabled={busy}>
    إرسال رابط إعادة تعيين PIN إلى الإيميل
   </button>
  </section>
  {error&&<p className="txt-danger card" role="alert">{error}</p>}
  {message&&<p className="card" role="status">{message}</p>}
 </div>;
}
