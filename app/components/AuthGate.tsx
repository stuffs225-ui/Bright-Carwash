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
 const initialFinished=useRef(false);
 const timeout=<T,>(work:PromiseLike<T>,ms=10000):Promise<T>=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error("Authentication timed out")),ms);
  Promise.resolve(work).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});
 });
 const refresh=useCallback(async()=>{
  if(refreshing.current)return;
  refreshing.current=true;
  // Never replace an already-open dashboard with a full-screen loader on token refresh.
  if(!initialFinished.current)setLoading(true);
  try{
   let result=await timeout(supabase.auth.getUser());
   if(!result.data.user){
    const paired=await timeout(fetch("/api/owner/session",{
     method:"POST",credentials:"same-origin",cache:"no-store"
    }));
    if(paired.ok){
     const payload=await paired.json().catch(()=>({}));
     if(payload.access_token&&payload.refresh_token){
      const applied=await supabase.auth.setSession({
       access_token:payload.access_token,refresh_token:payload.refresh_token
      });
      if(applied.error)throw applied.error;
      result=await timeout(supabase.auth.getUser());
     }
    }
   }
   const user=result.data.user;
   if(!user){setIdentity(null);setOfflineActor(null);return;}
   const {data:membership,error:memberError}=await timeout(supabase.from("app_members")
    .select("role,active").eq("user_id",user.id).maybeSingle());
   if(memberError||membership?.role!=="manager"||!membership.active){
    setIdentity(null);setOfflineActor(null);
    setError("افتح رابط الإدارة المباشر الخاص بك.");return;
   }
   setOfflineActor(user.id);
   // Only the verified manager UUID and verification time; NEVER session tokens,
   // manager access URL, PIN or customer information.
   try{localStorage.setItem("bright_carwash_manager_offline_id_v1",
    JSON.stringify({userId:user.id,verifiedAt:Date.now()}));}catch{}
   setIdentity({userId:user.id,email:user.email||"",role:"manager"});
   setError("");
  }catch{
   setIdentity(null);setOfflineActor(null);
   setError("تعذر استعادة جلسة الإدارة. تحقق من الإنترنت أو افتح رابط الإدارة الخاص بك.");
  }finally{
   initialFinished.current=true;
   setLoading(false);refreshing.current=false;
  }
 },[]);
 useEffect(()=>{
  if(!supabaseConfigured){setLoading(false);return;}
  void refresh();
  const {data:subscription}=supabase.auth.onAuthStateChange((event)=>{
   // INITIAL_SESSION arrives on every load and must not restart the loader.
   if(event==="INITIAL_SESSION"||event==="TOKEN_REFRESHED")return;
   if(event==="SIGNED_OUT"){
    // A short-lived Supabase token may expire while the 90-day HttpOnly
    // owner-device pairing cookie is still valid. Re-pair silently.
    setTimeout(()=>{void refresh();},0);
    return;
   }
   if(event==="SIGNED_IN"||event==="USER_UPDATED"){
    setTimeout(()=>{void refresh();},0);
   }
  });
  return()=>subscription.subscription.unsubscribe();
 },[refresh]);
 if(!supabaseConfigured)return <main className="min-h-screen flex items-center justify-center p-6" dir="rtl">
  <p className="txt-danger">إعدادات قاعدة البيانات غير متوفرة. الإدارة غير متاحة.</p>
 </main>;
 if(loading)return <main className="app-shell" dir="rtl" aria-busy="true">
  <header className="app-header"><h1 className="text-2xl font-extrabold">مغسلة سيارتك اللامعة</h1></header>
  <div className="content-section-wrapper space-y-4">
   <div className="h-12 rounded-xl animate-pulse" style={{background:"var(--surface-3)"}}/>
   <div className="grid grid-cols-2 gap-3">
    {[0,1,2,3].map(i=><div key={i} className="metric-card animate-pulse" style={{background:"var(--surface-3)"}}/>)}
   </div>
   <p className="txt-muted text-sm text-center">يتم استعادة الجلسة الآمنة...</p>
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
