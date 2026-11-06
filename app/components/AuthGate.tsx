"use client";

import {useCallback,useEffect,useState} from "react";
import {supabase,supabaseConfigured} from "@/lib/supabaseClient";
import {queueLength,setOfflineActor} from "@/lib/offlineQueue";
import {validFourDigitPin} from "@/lib/carwashPinRules";
import {DemoCarwashApp} from "./DemoCarwashApp";

export type AppRole="manager"|"worker";
export type AppIdentity={userId:string;email:string;role:AppRole};
export function AuthGate({children}:{children:(identity:AppIdentity)=>React.ReactNode}){
 const [identity,setIdentity]=useState<AppIdentity|null>(null);
 const [loading,setLoading]=useState(true);
 const [needsAccess,setNeedsAccess]=useState(false);
 const [pinConfigured,setPinConfigured]=useState(true);
 const [resetFlow,setResetFlow]=useState(false);
 const [recovery,setRecovery]=useState(false);
 const [recoverySent,setRecoverySent]=useState(false);
 const [email,setEmail]=useState("");
 const [pin,setPin]=useState("");
 const [code,setCode]=useState("");
 const [newPin,setNewPin]=useState("");
 const [confirmPin,setConfirmPin]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [submitting,setSubmitting]=useState(false);

 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const {data,error:authError}=await supabase.auth.getUser();
   if((authError||!data.user)&&typeof navigator!=="undefined"&&!navigator.onLine){
    // Only a previously verified worker's local offline shell; never the manager.
    try{
     const cached=localStorage.getItem("carwash_verified_worker_v2");
     const value=cached?JSON.parse(cached):null;
     const {data:session}=await supabase.auth.getSession();
     if(value?.role==="worker"&&session.session?.user.id===value.userId&&
        Date.now()-Number(value.verifiedAt)<14*86400000){
      setOfflineActor(value.userId);
      setIdentity({userId:value.userId,email:"حساب العامل — دون اتصال",role:"worker"});
      setNeedsAccess(false);return;
     }
    }catch{}
   }
   if(authError||!data.user){
    setOfflineActor(null);setIdentity(null);setNeedsAccess(false);return;
   }
   const {data:member,error:membershipError}=await supabase.from("app_members")
    .select("role,active").eq("user_id",data.user.id).maybeSingle();
   const role:AppRole|null=!member?.active?null:
      member.role==="manager"?"manager":member.role==="worker"?"worker":null;
   if(membershipError){setError("تعذر التحقق من صلاحية الحساب.");setIdentity(null);return;}
   if(!role){
    setOfflineActor(null);setIdentity(null);setNeedsAccess(true);return;
   }
   const {data:sessionData}=await supabase.auth.getSession();
   const token=sessionData.session?.access_token;
   if(!token){setError("انتهت الجلسة. أعد الدخول.");setIdentity(null);return;}
   const status=await fetch("/api/auth/pin/status",{
    headers:{authorization:"Bearer "+token},cache:"no-store"
   });
   const info=await status.json().catch(()=>null);
   if(!status.ok||typeof info?.configured!=="boolean"){
    setError("تعذر التحقق من حالة رمز الدخول. حاول مجددًا.");
    setIdentity(null);return;
   }
   setPinConfigured(info.configured);
   if(typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("reset")==="1"){
    setResetFlow(true);
   }
   setOfflineActor(data.user.id);
   if(role==="worker"){
    localStorage.setItem("carwash_verified_worker_v2",JSON.stringify({
     userId:data.user.id,role,verifiedAt:Date.now()
    }));
   }else localStorage.removeItem("carwash_verified_worker_v2");
   setIdentity({userId:data.user.id,email:data.user.email||"",role});
   setNeedsAccess(false);setError("");
  }finally{setLoading(false);}
 },[]);

 useEffect(()=>{
  if(!supabaseConfigured){setLoading(false);return;}
  void refresh();
  const {data:subscription}=supabase.auth.onAuthStateChange(()=>{
   setTimeout(()=>{void refresh();},0);
  });
  return()=>subscription.subscription.unsubscribe();
 },[refresh]);

 async function signIn(e:React.FormEvent){
  e.preventDefault();setError("");setNotice("");
  const address=email.trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(address)||!validFourDigitPin(pin)){
   setError("أدخل الإيميل ورمز PIN الصحيح من أربعة أرقام.");return;
  }
  setSubmitting(true);
  try{
   const response=await fetch("/api/auth/pin",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({email:address,pin}),cache:"no-store"
   });
   const payload=await response.json().catch(()=>null);
   if(!response.ok||!payload?.access_token||!payload?.refresh_token)
    throw new Error(payload?.error||"تعذر تسجيل الدخول");
   const {error:sessionError}=await supabase.auth.setSession({
    access_token:payload.access_token,refresh_token:payload.refresh_token
   });
   if(sessionError)throw sessionError;
   setPin("");await refresh();
  }catch(e){setError(e instanceof Error?e.message:"تعذر تسجيل الدخول");}
  finally{setSubmitting(false);}
 }

 async function sendRecovery(e:React.FormEvent){
  e.preventDefault();setError("");setNotice("");
  const address=email.trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(address)){setError("أدخل بريدًا إلكترونيًا صحيحًا.");return;}
  setSubmitting(true);
  try{
   const {error:linkError}=await supabase.auth.signInWithOtp({
    email:address,options:{
     shouldCreateUser:false,
     emailRedirectTo:window.location.origin+"/?reset=1"
    }
   });
   if(linkError)throw linkError;
   setRecoverySent(true);
   setNotice("إذا كان البريد مسجلًا فستصلك رسالة تحقق. افتح الرابط، ثم أنشئ PIN جديدًا. يمكنك أيضًا إدخال رمز البريد إذا احتوت الرسالة على رمز.");
  }catch(e){
   setError(e instanceof Error?"تعذر إرسال رسالة التحقق: "+e.message:"تعذر إرسال رسالة التحقق");
  }finally{setSubmitting(false);}
 }

 async function verifyCode(e:React.FormEvent){
  e.preventDefault();setError("");setSubmitting(true);
  try{
   const result=await supabase.auth.verifyOtp({
    email:email.trim().toLowerCase(),token:code.trim(),type:"email"
   });
   if(result.error||!result.data.session)throw Error("رمز التحقق غير صحيح أو منتهي");
   setCode("");setResetFlow(true);await refresh();
  }catch(e){setError(e instanceof Error?e.message:"تعذر تأكيد البريد");}
  finally{setSubmitting(false);}
 }

 async function savePin(e:React.FormEvent){
  e.preventDefault();setError("");
  if(!validFourDigitPin(newPin)||newPin!==confirmPin){
   setError("اختر أربعة أرقام متطابقة ثم أعد المحاولة.");return;
  }
  setSubmitting(true);
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)throw Error("انتهت جلسة التحقق؛ اطلب رابط البريد من جديد.");
   const response=await fetch("/api/auth/pin/enroll",{
    method:"POST",headers:{"content-type":"application/json",
     authorization:"Bearer "+session.access_token},
    body:JSON.stringify({mode:pinConfigured?"reset":"setup",
     newPin,confirmPin}),cache:"no-store"
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||"تعذر حفظ PIN");
   setNewPin("");setConfirmPin("");setPinConfigured(true);setResetFlow(false);
   if(typeof window!=="undefined")window.history.replaceState(null,"",window.location.pathname);
   await supabase.auth.signOut({scope:"local"});
   setRecovery(false);setRecoverySent(false);setNotice("تم تفعيل رمزك الجديد. ادخل الآن بإيميلك ورمز PIN.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ PIN");}
  finally{setSubmitting(false);}
 }

 async function signOut(){
  if(queueLength()>0){setError("يوجد تسجيلات غير متزامنة؛ زامنها قبل الخروج.");return;}
  await supabase.auth.signOut({scope:"local"});
  localStorage.removeItem("carwash_verified_worker_v2");
  setIdentity(null);setNeedsAccess(false);setResetFlow(false);setPin("");
 }

 if(!supabaseConfigured)return <DemoCarwashApp/>;
 if(loading)return <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
  جارٍ التحقق من الحساب...
 </div>;

 if(identity&&(!pinConfigured||resetFlow))return <div className="min-h-screen flex items-center justify-center p-5" dir="rtl">
  <div className="card w-full max-w-md space-y-4">
   <h1 className="section-title">{pinConfigured?"استعادة رمز الدخول":"تفعيل رمز الدخول لأول مرة"}</h1>
   <p className="txt-muted text-sm">البريد المؤكد: {identity.email}</p>
   <p className="txt-muted text-sm">اختر أربعة أرقام لتسجيل الدخول بالإيميل مستقبلًا. لا نحتاج رقم جوال أو كلمة مرور طويلة.</p>
   <form onSubmit={savePin} className="space-y-3">
    <label className="form-label">رمز PIN الجديد (4 أرقام)
     <input type="password" inputMode="numeric" autoComplete="new-password" required
       maxLength={4} pattern="[0-9]{4}" value={newPin}
       onChange={e=>setNewPin(e.target.value.replace(/\D/g,"").slice(0,4))}
       placeholder="••••"/>
    </label>
    <label className="form-label">تأكيد رمز PIN
     <input type="password" inputMode="numeric" autoComplete="new-password" required
       maxLength={4} pattern="[0-9]{4}" value={confirmPin}
       onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,"").slice(0,4))}
       placeholder="••••"/>
    </label>
    <button className="btn-primary w-full" type="submit" disabled={submitting}>
     {submitting?"جارٍ الحفظ...":"حفظ رمز PIN والدخول"}
    </button>
   </form>
   <button className="btn-secondary w-full" type="button" onClick={()=>void signOut()}>إلغاء وتسجيل خروج</button>
   {error&&<p role="alert" className="txt-danger">{error}</p>}
  </div>
 </div>;

 if(!identity)return <div className="min-h-screen flex items-center justify-center p-5" dir="rtl">
  <div className="card w-full max-w-md space-y-4">
   <h1 className="section-title">مغسلة سيارتك اللامعة</h1>
   {needsAccess?<div>
    <p className="txt-warning">البريد مسجل لكنه غير مفعّل في المغسلة. راجع مدير النظام.</p>
    <button type="button" className="btn-secondary w-full mt-3" onClick={()=>void signOut()}>تسجيل خروج</button>
   </div>:recovery?<div className="space-y-4">
    <h2 className="subsection-title">أول مرة أو نسيت PIN؟</h2>
    <p className="txt-muted text-sm">سنرسل رابط تحقق إلى الإيميل المسجل لتختار رمزًا جديدًا؛ لا يلزم رقم جوال.</p>
    <form onSubmit={sendRecovery} className="space-y-3">
     <label className="form-label">الإيميل
      <input type="email" inputMode="email" autoComplete="username" required
       value={email} onChange={e=>setEmail(e.target.value)}
       placeholder="name@example.com"/>
     </label>
     <button type="submit" className="btn-primary w-full" disabled={submitting}>
      {submitting?"جارٍ الإرسال...":"إرسال رابط استعادة PIN إلى الإيميل"}
     </button>
    </form>
    {recoverySent&&<form onSubmit={verifyCode} className="space-y-2">
     <label className="form-label">رمز تحقق البريد (إذا وصلك كود من 6 أرقام)
      <input type="text" inputMode="numeric" autoComplete="one-time-code"
       value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
       pattern="[0-9]{6}" maxLength={6} required/>
     </label>
     <button type="submit" className="btn-secondary w-full" disabled={submitting}>تأكيد كود البريد</button>
    </form>}
    <button type="button" className="btn-secondary w-full" onClick={()=>{setRecovery(false);setError("");}}>العودة لتسجيل الدخول</button>
   </div>:<form onSubmit={signIn} className="space-y-4">
    <p className="txt-muted text-sm">دخول المدير والعامل بالإيميل ورمز PIN المكوّن من أربعة أرقام.</p>
    <label className="form-label">الإيميل
     <input type="email" inputMode="email" autoComplete="username" required
      value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/>
    </label>
    <label className="form-label">رمز PIN (4 أرقام)
     <input type="password" inputMode="numeric" autoComplete="current-password" required
      maxLength={4} pattern="[0-9]{4}" value={pin}
      onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))}
      placeholder="••••"/>
    </label>
    <button className="btn-primary w-full" type="submit" disabled={submitting}>
     {submitting?"جارٍ التحقق...":"دخول"}
    </button>
    <button className="btn-secondary w-full" type="button" onClick={()=>{setRecovery(true);setError("");}}>
     أول مرة أو نسيت رمز PIN؟
    </button>
    <p className="txt-muted text-xs">بعد خمس محاولات خاطئة يتوقف الدخول مؤقتًا لحماية الحساب.</p>
   </form>}
   {error&&<p className="txt-danger" role="alert">{error}</p>}
   {notice&&<p className="txt-muted text-sm" role="status">{notice}</p>}
  </div>
 </div>;
 return <>{children(identity)}</>;
}
