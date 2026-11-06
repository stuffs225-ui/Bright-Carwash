"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "@/lib/supabaseClient";

export default function DirectManagerPage({params}:{params:{token:string}}){
 const [error,setError]=useState("");
 const started=useRef(false);
 useEffect(()=>{
  if(started.current)return;
  started.current=true;
  const token=params.token||"";
  // Hide the secret portion from browser history and outgoing referers.
  window.history.replaceState(null,"","/");
  async function open(){
   if(!/^[a-f0-9]{64}$/.test(token)){
    setError("رابط الإدارة غير صالح. استخدم الرابط الكامل الذي تم إصداره.");return;
   }
   try{
    const response=await fetch("/api/owner/activate",{
     method:"POST",
     headers:{"content-type":"application/json"},
     body:JSON.stringify({token}),
     credentials:"same-origin",
     cache:"no-store",
     referrerPolicy:"no-referrer"
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.access_token||!data.refresh_token)
     throw Error(data.error||"تعذر فتح لوحة الإدارة");
    const {error:sessionError}=await supabase.auth.setSession({
     access_token:data.access_token,refresh_token:data.refresh_token
    });
    if(sessionError)throw Error("تعذر إنشاء جلسة الإدارة");
    window.location.replace("/");
   }catch(e){setError(e instanceof Error?e.message:"تعذر فتح لوحة الإدارة");}
  }
  void open();
 },[params.token]);
 return <main className="min-h-screen flex items-center justify-center p-5" dir="rtl">
  <div className="card w-full max-w-md text-center space-y-3">
   <h1 className="section-title">مغسلة سيارتك اللامعة</h1>
   {error?<><p className="txt-danger" role="alert">{error}</p>
     <p className="txt-muted text-sm">هذا الرابط خاص بصلاحيات المدير كاملة. استخدم الرابط الحالي غير الملغى.</p>
   </>:<p>جارٍ فتح لوحة الإدارة مباشرة...</p>}
  </div>
 </main>;
}
