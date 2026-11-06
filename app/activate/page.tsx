"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";

export default function ActivateOwnerPage(){
 const [message,setMessage]=useState("جارٍ ربط هذا الجهاز بحساب المدير...");
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  async function activate(){
   const token=new URLSearchParams(window.location.search).get("token")||"";
   window.history.replaceState(null,"","/activate");
   if(!/^[a-f0-9]{64}$/.test(token)){
    setFailed(true);setMessage("رابط الإدارة غير صحيح. يجب فتح رابط التفعيل الخاص بجهازك.");return;
   }
   try{
    const res=await fetch("/api/owner/activate",{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({token}),credentials:"same-origin",cache:"no-store"
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.access_token||!data.refresh_token)
     throw Error(data.error||"تعذر تفعيل الإدارة");
    if(cancelled)return;
    const {error}=await supabase.auth.setSession({
     access_token:data.access_token,refresh_token:data.refresh_token
    });
    if(error)throw error;
    window.location.replace("/");
   }catch(e){
    if(cancelled)return;
    setFailed(true);
    setMessage(e instanceof Error?e.message:"تعذر فتح الإدارة");
   }
  }
  void activate();
  return()=>{cancelled=true;};
 },[]);
 return <main className="min-h-screen flex items-center justify-center p-5" dir="rtl">
  <div className="card w-full max-w-md space-y-4 text-center">
   <h1 className="section-title">مغسلة سيارتك اللامعة</h1>
   <p className="text-sm">{message}</p>
   {!failed?<p className="txt-muted text-sm">هذا الربط يتم مرة واحدة. بعدها ستفتح الإدارة تلقائيًا على جهازك.</p>:
    <p className="txt-warning text-sm">رابط التفعيل يستخدم مرة واحدة فقط. يمكنك إنشاء رابط جديد من جهاز مدير مرتبط مسبقًا.</p>}
  </div>
 </main>;
}
