"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {supabase,supabaseConfigured} from "@/lib/supabaseClient";
import {setOfflineActor} from "@/lib/offlineQueue";

export type AppRole="manager"|"worker";
export type AppIdentity={userId:string;email:string;role:AppRole};

/**
 * No username, password, phone or PIN form:
 * - The reusable secret manager URL opens this account from any device.
 * - The server restores a real manager Supabase session from a private,
 *   HttpOnly device cookie, only while the manager membership is active.
 * - The worker does NOT use this gate; its scoped /w/<token> route is separate.
 */
export function AuthGate({children}:{children:(identity:AppIdentity)=>React.ReactNode}){
 const [identity,setIdentity]=useState<AppIdentity|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const refreshing=useRef(false);
 const refresh=useCallback(async()=>{
  if(refreshing.current)return;
  refreshing.current=true;
  setLoading(true);
  try{
   let result=await supabase.auth.getUser();
   if(!result.data.user){
    const paired=await fetch("/api/owner/session",{
     method:"POST",credentials:"same-origin",cache:"no-store"
    });
    if(paired.ok){
     const payload=await paired.json().catch(()=>({}));
     if(payload.access_token&&payload.refresh_token){
      const applied=await supabase.auth.setSession({
       access_token:payload.access_token,refresh_token:payload.refresh_token
      });
      if(applied.error)throw applied.error;
      result=await supabase.auth.getUser();
     }
    }
   }
   const user=result.data.user;
   if(!user){setIdentity(null);setOfflineActor(null);return;}
   const {data:membership,error:memberError}=await supabase.from("app_members")
    .select("role,active").eq("user_id",user.id).maybeSingle();
   if(memberError||membership?.role!=="manager"||!membership.active){
    setIdentity(null);setOfflineActor(null);
    setError("افتح رابط الإدارة المباشر الخاص بك.");return;
   }
   setOfflineActor(user.id);
   setIdentity({userId:user.id,email:user.email||"",role:"manager"});
   setError("");
  }catch{
   setIdentity(null);setOfflineActor(null);
   setError("تعذر استعادة جلسة الإدارة. تحقق من الإنترنت أو افتح رابط الإدارة الخاص بك.");
  }finally{
   setLoading(false);refreshing.current=false;
  }
 },[]);
 useEffect(()=>{
  if(!supabaseConfigured){setLoading(false);return;}
  void refresh();
  const {data:subscription}=supabase.auth.onAuthStateChange(()=>{
   // Defer Auth SDK calls until callback lock is released.
   setTimeout(()=>{void refresh();},0);
  });
  return()=>subscription.subscription.unsubscribe();
 },[refresh]);
 if(!supabaseConfigured)return <main className="min-h-screen flex items-center justify-center p-6" dir="rtl">
  <p className="txt-danger">إعدادات قاعدة البيانات غير متوفرة. الإدارة غير متاحة.</p>
 </main>;
 if(loading)return <main className="min-h-screen flex items-center justify-center p-5" dir="rtl">
  <div className="card w-full max-w-md text-center space-y-3">
   <h1 className="section-title">مغسلة سيارتك اللامعة</h1>
   <p>جارٍ فتح الإدارة على جهازك...</p>
  </div>
 </main>;
 if(!identity)return <main className="min-h-screen flex items-center justify-center p-5" dir="rtl">
  <div className="card w-full max-w-md space-y-4 text-center">
   <h1 className="section-title">مغسلة سيارتك اللامعة</h1>
   <h2 className="subsection-title">لوحة الإدارة الخاصة</h2>
   <p className="txt-muted">لا تحتاج إيميل أو كلمة مرور أو تفعيل. افتح رابط الإدارة المباشر الخاص بك من أي جهاز لفتح اللوحة تلقائيًا.</p>
   {error&&<p className="txt-warning text-sm">{error}</p>}
   <button className="btn-secondary w-full" onClick={()=>void refresh()}>إعادة محاولة فتح الإدارة</button>
   <p className="txt-muted text-xs">رابط العامل يفتح تسجيل السيارات فقط، بينما رابط الإدارة يفتح جميع صلاحيات المدير.</p>
  </div>
 </main>;
 return <>{children(identity)}</>;
}
