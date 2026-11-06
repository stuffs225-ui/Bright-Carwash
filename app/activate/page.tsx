"use client";
import {useEffect} from "react";

export default function LegacyOwnerLinkRedirect(){
 useEffect(()=>{
  const token=new URLSearchParams(window.location.search).get("token")||"";
  window.history.replaceState(null,"","/");
  if(/^[a-f0-9]{64}$/.test(token)){
   window.location.replace("/admin/"+token);
  }else window.location.replace("/");
 },[]);
 return <main className="min-h-screen flex items-center justify-center p-5" dir="rtl">
  <p>جارٍ فتح لوحة الإدارة...</p>
 </main>;
}
