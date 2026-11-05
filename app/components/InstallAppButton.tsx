"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt:()=>Promise<void>;
  userChoice:Promise<{outcome:"accepted"|"dismissed";platform:string}>;
};
export function InstallAppButton(){
  const [candidate,setCandidate]=useState<InstallEvent|null>(null);
  const [ios,setIos]=useState(false);
  const [standalone,setStandalone]=useState(false);
  const [instructions,setInstructions]=useState(false);

  useEffect(()=>{
    const standaloneNow=window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & {standalone?:boolean}).standalone===true;
    setStandalone(standaloneNow);
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    const capture=(event:Event)=>{event.preventDefault();setCandidate(event as InstallEvent);};
    const done=()=>{setStandalone(true);setCandidate(null);setInstructions(false);};
    window.addEventListener("beforeinstallprompt",capture);
    window.addEventListener("appinstalled",done);
    return()=>{window.removeEventListener("beforeinstallprompt",capture);window.removeEventListener("appinstalled",done);};
  },[]);
  if(standalone)return null;
  async function install(){
    if(candidate){
      await candidate.prompt();
      await candidate.userChoice;
      setCandidate(null);
    }else setInstructions(true);
  }
  return <>
    <button type="button" className="btn-secondary" onClick={()=>void install()}>
      <span aria-hidden="true">📲</span> تثبيت تطبيق المغسلة
    </button>
    {instructions&&<div className="fixed inset-0 z-[1600] flex items-center justify-center p-4"
      style={{background:"rgba(0,0,0,.65)"}} dir="rtl">
      <div className="card max-w-md w-full space-y-3" role="dialog" aria-modal="true" aria-label="تثبيت التطبيق">
        <h2 className="section-title">تثبيت المغسلة على الجوال</h2>
        {ios?
          <p>على iPhone: افتح الرابط في <strong>Safari</strong>، اضغط أيقونة المشاركة، ثم <strong>إضافة إلى الشاشة الرئيسية</strong>، وأكد الإضافة. قد تحتاج للتمرير في قائمة المشاركة.</p>:
          <p>على Android: افتح الرابط في <strong>Chrome</strong>، واضغط قائمة النقاط الثلاث ثم <strong>تثبيت التطبيق</strong> أو «إضافة إلى الشاشة الرئيسية».</p>}
        <p className="txt-warning text-sm">التثبيت يضيف تطبيق الويب إلى الجهاز. لا يُنشئ حسابًا ولا يفعّل الرسائل أو قاعدة البيانات، ولا يضمن تشغيل كل الوظائف بلا إنترنت.</p>
        <button className="btn-primary w-full" type="button" onClick={()=>setInstructions(false)}>فهمت</button>
      </div>
    </div>}
  </>;
}
