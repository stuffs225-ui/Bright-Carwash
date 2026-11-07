"use client";
import {useCallback,useEffect,useState} from "react";
import {AuthGate,type AppIdentity} from "./components/AuthGate";
import {CarRegistrationScreen} from "./components/CarRegistrationScreen";
import {AnalysisTab} from "./components/AnalysisTab";
import {ExpensesTab} from "./components/ExpensesTab";
import {WorkersHub} from "./components/WorkersHub";
import {SettlementHub} from "./components/SettlementHub";
import {SettingsHub} from "./components/SettingsHub";
import {OfflineStatusBadge} from "./components/OfflineStatusBadge";
import {ServiceWorkerRegister} from "./components/ServiceWorkerRegister";
import {ErrorMonitor} from "./components/ErrorMonitor";
import {ErrorBoundary} from "./components/ErrorBoundary";
type Tab="car"|"dashboard"|"expenses"|"workers"|"settlement"|"settings";
const pages:{key:Tab;label:string;icon:string}[]=[
 {key:"car",label:"تسجيل سيارة",icon:"🚗"},
 {key:"dashboard",label:"اللوحة الرئيسية",icon:"📊"},
 {key:"expenses",label:"المصروفات",icon:"💳"},
 {key:"workers",label:"العمال والرواتب",icon:"👥"},
 {key:"settlement",label:"اعتماد الموازنة",icon:"✅"},
 {key:"settings",label:"الإعدادات",icon:"⚙️"}
];
const STORE="bright_carwash_manager_last_tab_v3";
const valid=(v:string|null):v is Tab=>pages.some(x=>x.key===v);
function CarwashApp({identity}:{identity:AppIdentity}){
 const [tab,setTab]=useState<Tab>("car");
 const [restored,setRestored]=useState(false);
 useEffect(()=>{
  try{
   const url=new URL(window.location.href);
   const direct=url.searchParams.get("tab");
   const saved=window.localStorage.getItem(STORE);
   setTab(valid(direct)?direct:valid(saved)?saved:"car");
  }catch{setTab("car");}
  setRestored(true);
  function pop(){
   const direct=new URLSearchParams(window.location.search).get("tab");
   if(valid(direct))setTab(direct);
   else setTab("car");
  }
  window.addEventListener("popstate",pop);
  return()=>window.removeEventListener("popstate",pop);
 },[]);
 const navigate=useCallback((next:Tab)=>{
  setTab(next);
  try{
   localStorage.setItem(STORE,next);
   const url=new URL(window.location.href);
   url.searchParams.set("tab",next);
   window.history.pushState({tab:next},"",url.pathname+url.search+url.hash);
  }catch{/* Navigation remains usable if storage is blocked. */}
 },[]);
 return <ErrorBoundary>
  <ErrorMonitor/>
  <div className="app-shell" dir="rtl">
   <header className="app-header carwash-compact-header">
    <h1 className="text-2xl sm:text-3xl font-extrabold">مغسلة سيارتك اللامعة</h1>
    <p className="text-sm opacity-90 mt-1">إدارة المغسلة</p>
   </header>
   <nav className="carwash-main-tabs" aria-label="الصفحات الرئيسية">
    {pages.map(p=><button type="button" key={p.key}
     aria-current={tab===p.key?"page":undefined}
     className={tab===p.key?"active":""}
     onClick={()=>navigate(p.key)}>
     <span aria-hidden="true">{p.icon}</span><span>{p.label}</span>
    </button>)}
   </nav>
   <main className="content-section-wrapper">
    {restored&&tab==="car"&&<CarRegistrationScreen manager/>}
    {restored&&tab==="dashboard"&&<AnalysisTab/>}
    {restored&&tab==="expenses"&&<ExpensesTab/>}
    {restored&&tab==="workers"&&<WorkersHub/>}
    {restored&&tab==="settlement"&&<SettlementHub/>}
    {restored&&tab==="settings"&&<SettingsHub/>}
   </main>
   <div id="toast-container"/>
   <OfflineStatusBadge/>
   <ServiceWorkerRegister/>
  </div>
 </ErrorBoundary>;
}
export default function Home(){
 return <AuthGate>{identity=><CarwashApp identity={identity}/>}</AuthGate>;
}
