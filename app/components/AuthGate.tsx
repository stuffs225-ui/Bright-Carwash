"use client";

import {useCallback,useEffect,useState} from "react";
import {supabase,supabaseConfigured} from "@/lib/supabaseClient";
import {queueLength,setOfflineActor} from "@/lib/offlineQueue";
import {normalizeSaudiMobile} from "@/lib/phone";
import {validFourDigitPin} from "@/lib/carwashPinRules";
import {DemoCarwashApp} from "./DemoCarwashApp";

export type AppRole="manager"|"worker";
export type AppIdentity={userId:string;email:string;role:AppRole};
export function AuthGate({children}:{children:(identity:AppIdentity)=>React.ReactNode}){
 const [identity,setIdentity]=useState<AppIdentity|null>(null);
 const [loading,setLoading]=useState(true);
 const [needsAccess,setNeedsAccess]=useState(false);
 const [phone,setPhone]=useState("");
 const [pin,setPin]=useState("");
 const [email,setEmail]=useState("");
 const [emailPassword,setEmailPassword]=useState("");
 const [notice,setNotice]=useState("");
 const [sendingLink,setSendingLink]=useState(false);
 const [emailMode,setEmailMode]=useState(false);
 const [error,setError]=useState("");
 const [submitting,setSubmitting]=useState(false);

 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  const {data,error:authError}=await supabase.auth.getUser();
  if((authError||!data.user)&&typeof navigator!=="undefined"&&!navigator.onLine){
   // A previously verified employee can REOPEN the OFFLINE worker shell.
   // The app must still have a cached session; this NEVER unlocks management.
   try{
    const cached=localStorage.getItem("carwash_verified_worker_v2");
    const value=cached?JSON.parse(cached):null;
    const {data:session}=await supabase.auth.getSession();
    if(value?.role==="worker"&&session.session?.user.id===value.userId
      &&Date.now()-Number(value.verifiedAt)<14*86400000){
     setOfflineActor(value.userId);
     setIdentity({userId:value.userId,email:"حساب العمال — دون إنترنت",role:"worker"});
     setNeedsAccess(false);setLoading(false);return;
    }
   }catch{}
  }
  if(authError||!data.user){
   setOfflineActor(null);setIdentity(null);setNeedsAccess(false);setLoading(false);
   return;
  }
  const {data:member,error:membershipError}=await supabase.from("app_members")
   .select("role,active").eq("user_id",data.user.id).maybeSingle();
  if(membershipError){
   setError("تعذر التحقق من الصلاحيات؛ تحقق من الاتصال وقاعدة بيانات المغسلة");
  }
  const role:AppRole|null=!member?.active?null:
   member.role==="worker"?"worker":member.role==="manager"?"manager":null;
  setOfflineActor(role?data.user.id:null);
  if(role==="worker"){
   localStorage.setItem("carwash_verified_worker_v2",JSON.stringify({
    userId:data.user.id,role,verifiedAt:Date.now()
   }));
  }else localStorage.removeItem("carwash_verified_worker_v2");
  setIdentity(role?{userId:data.user.id,email:data.user.email||data.user.phone||"",role}:null);
  setNeedsAccess(!role);setLoading(false);
 },[]);

 useEffect(()=>{
  if(!supabaseConfigured){setLoading(false);return;}
  void refresh();
  // Defer Auth calls until the auth-state callback has released its lock.
  const {data:subscription}=supabase.auth.onAuthStateChange(()=>{
   setTimeout(()=>{void refresh();},0);
  });
  return()=>subscription.subscription.unsubscribe();
 },[refresh]);

 async function signIn(e:React.FormEvent){
  e.preventDefault();
  const normalized=normalizeSaudiMobile(phone);
  if(!normalized||!validFourDigitPin(pin)){
   setError("أدخل رقم جوال سعودي صحيحًا ورمزًا من أربعة أرقام.");return;
  }
  setSubmitting(true);setError("");
  try{
   const response=await fetch("/api/auth/pin",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({phone:normalized,pin}),cache:"no-store"
   });
   const payload=await response.json().catch(()=>null);
   if(!response.ok||!payload?.access_token||!payload?.refresh_token){
    throw new Error(payload?.error||"تعذر تسجيل الدخول");
   }
   const {error:sessionError}=await supabase.auth.setSession({
    access_token:payload.access_token,refresh_token:payload.refresh_token
   });
   if(sessionError)throw sessionError;
   setPin("");
   await refresh();
  }catch(e){
   setError(e instanceof Error?e.message:"تعذر تسجيل الدخول؛ حاول لاحقًا");
  }finally{setSubmitting(false);}
 }

 async function signInEmail(e:React.FormEvent){
  e.preventDefault();setSubmitting(true);setError("");
  try{
   const {data,error:loginError}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password:emailPassword});
   if(loginError||!data.user)throw new Error("تعذر الدخول بالإيميل؛ تحقق من كلمة المرور.");
   const {data:member,error:memberError}=await supabase.from("app_members").select("role,active").eq("user_id",data.user.id).maybeSingle();
   if(memberError||member?.role!=="manager"||member?.active!==true){
    await supabase.auth.signOut({scope:"local"});
    throw new Error("حساب الإيميل ليس مديرًا نشطًا.");
   }
   setEmailPassword("");await refresh();
  }catch(e){setError(e instanceof Error?e.message:"تعذر تسجيل الدخول");}
  finally{setSubmitting(false);}
 }
 async function emailLink(e:React.FormEvent){
  e.preventDefault();setError("");setNotice("");setSendingLink(true);
  try{
   const address=email.trim().toLowerCase();
   if(!address)throw new Error("أدخل البريد الإلكتروني أولًا.");
   const {error:linkError}=await supabase.auth.signInWithOtp({
    email:address,
    options:{shouldCreateUser:false,emailRedirectTo:window.location.origin},
   });
   if(linkError)throw linkError;
   setNotice("إذا كان البريد مسجلًا، سيصلك رابط دخول آمن. افتحه من نفس المتصفح على الجوال. لا ينشئ هذا الإجراء حسابًا جديدًا ولا يغيّر رمز PIN.");
  }catch{setError("تعذر إرسال رابط الدخول. تحقق من إعدادات البريد في Supabase أو حاول لاحقًا.");}
  finally{setSendingLink(false);}
 }
 async function signOut(){
  if(queueLength()>0){
   setError("يوجد سيارات غير متزامنة. أعد الاتصال بالإنترنت قبل تسجيل الخروج.");return;
  }
  await supabase.auth.signOut({scope:"local"});
  localStorage.removeItem("carwash_verified_worker_v2");
  setIdentity(null);setNeedsAccess(false);setPin("");
 }
 if(!supabaseConfigured)return <DemoCarwashApp/>;
 if(loading)return <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
  جاري التحقق من حساب المغسلة والصلاحيات...
 </div>;
 if(!identity)return <div className="min-h-screen flex items-center justify-center p-5" dir="rtl">
  <div className="card w-full max-w-md space-y-4">
   <h1 className="section-title">مغسلة سيارتك اللامعة</h1>
   {needsAccess?<div>
    <p className="txt-warning">رقم الجوال موجود ولكنه غير مفعل في المغسلة. المدير يستطيع إضافة حساب العامل المشترك.</p>
    <button type="button" className="btn-secondary w-full mt-3" onClick={()=>void signOut()}>خروج</button>
   </div>:emailMode?<form onSubmit={signInEmail} className="space-y-4">
    <p className="txt-muted text-sm">الدخول بالبريد الإلكتروني المسجل في النظام. يجب أن يكون الحساب نشطًا ومخوّلًا بصلاحية المدير.</p>
    <label className="form-label">الإيميل<input type="email" inputMode="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" /></label>
    <label className="form-label">كلمة المرور<input type="password" autoComplete="current-password" required value={emailPassword} onChange={e=>setEmailPassword(e.target.value)}/></label>
    <button className="btn-primary w-full" type="submit" disabled={submitting}> {submitting?"جارٍ التحقق...":"دخول بالإيميل وكلمة المرور"} </button>
    <button className="btn-secondary w-full" type="button" disabled={sendingLink||!email.trim()} onClick={e=>void emailLink(e)}> {sendingLink?"جارٍ إرسال الرابط...":"أرسل رابط دخول آمن إلى إيميلي"} </button>
    <p className="txt-muted text-xs">رابط البريد خيار الدخول الآمن عندما لا تعرف كلمة المرور؛ لا يغيّر كلمة مرورك الحالية ولا يعطل PIN الخاص بالعمال. لن يتم إنشاء حساب تلقائيًا.</p>
    <button className="btn-secondary w-full" type="button" onClick={()=>{setEmailMode(false);setError("");setNotice("");}}>العودة لدخول الجوال</button>
   </form>:<form onSubmit={signIn} className="space-y-4">
    <p className="txt-muted text-sm">ادخل برقم جوالك ورمزك الشخصي المكون من 4 أرقام. يبقى الجهاز متصلًا أثناء صلاحية الجلسة.</p>
    <label className="form-label">رقم الجوال
     <input type="tel" autoComplete="username" inputMode="tel" required
      value={phone} onChange={e=>setPhone(e.target.value)} placeholder="05XXXXXXXX" />
    </label>
    <label className="form-label">رمز الدخول (4 أرقام)
     <input type="password" inputMode="numeric" autoComplete="current-password"
      maxLength={4} pattern="[0-9]{4}" required value={pin}
      onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="••••" />
    </label>
    <button className="btn-primary w-full" type="submit" disabled={submitting}>
     {submitting?"جارٍ التحقق...":"دخول"}
    </button>
    <button type="button" className="btn-secondary w-full" onClick={()=>{setEmailMode(true);setError("");setNotice("");}}>دخول المدير بالإيميل</button>
    <p className="txt-muted text-xs">بعد 5 محاولات غير صحيحة يُوقف الدخول مؤقتًا. يمكن تغيير رمز الدخول من معلومات الحساب بعد تسجيل الدخول.</p>
   </form>}
   {error&&<p className="txt-danger" role="alert">{error}</p>}
   {notice&&<p className="txt-muted text-sm" role="status">{notice}</p>}
  </div>
 </div>;
 return <>{children(identity)}</>;
}
