"use client";
import {useEffect,useState} from "react";
import {workerText,workerDirection,readWorkerLocale,persistWorkerLocale,type WorkerLocale} from "@/lib/workerI18n";
export default function WorkerLanding(){
 const [lang,setLang]=useState<WorkerLocale>("ha-NG");
 useEffect(()=>{
  const saved=readWorkerLocale();setLang(saved);
  document.documentElement.lang=saved;
  document.documentElement.dir=workerDirection(saved);
  document.documentElement.removeAttribute("data-worker-lang-pending");
 },[]);
 return <main dir={workerDirection(lang)} lang={lang}
  className="worker-screen min-h-screen flex items-center justify-center p-5">
  <section className="card max-w-md w-full space-y-4 text-center">
   <div className="flex gap-2 justify-center" dir="ltr" role="group" aria-label="Language">
    {(["ha-NG","en","ar"] as const).map(x=><button key={x} type="button"
     className={lang===x?"btn-primary px-3 py-2":"btn-secondary px-3 py-2"}
     onClick={()=>{setLang(x);persistWorkerLocale(x);
      document.documentElement.lang=x;document.documentElement.dir=workerDirection(x);}}>
     {x==="ha-NG"?"Hausa":x==="en"?"English":"العربية"}
    </button>)}
   </div>
   <h1 className="section-title">{workerText(lang,"reg.title")}</h1>
   <p className="txt-muted">{workerText(lang,"reg.invalid")}</p>
  </section>
 </main>;
}
