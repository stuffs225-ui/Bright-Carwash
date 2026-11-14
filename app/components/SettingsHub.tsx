"use client";
import {useEffect,useMemo,useState} from "react";
import type {AppIdentity} from "./AuthGate";
import {SettingsTab} from "./SettingsTab";
import {WorkerDirectorySettings} from "./WorkerDirectorySettings";
import {InventoryTab} from "./InventoryTab";
import {AccountSettings} from "./AccountSettings";
import {AlertsTab} from "./AlertsTab";
import {ReconciliationTab} from "./ReconciliationTab";
import {UsersTab} from "./UsersTab";
import {ImportSheetSection} from "./ImportSheetSection";

type Section="home"|"workers"|"services"|"operations"|"inventory"|"alerts"|"links"|"device"|"audit"|"backup";
const cards:{key:Exclude<Section,"home">;title:string;description:string;icon:string}[]=[
 {key:"workers",title:"العمال وإدارة الفريق",description:"إضافة · تعديل · أرشفة · استرجاع",icon:"👥"},
 {key:"services",title:"الخدمات والأسعار",description:"أسعار التسجيل السريع · أنواع السيارات والخدمات",icon:"🚗"},
 {key:"inventory",title:"المخزون والمواد",description:"الأصناف · الجرد · الاستهلاك",icon:"📦"},
 {key:"operations",title:"إعدادات التشغيل",description:"السعر الاستثنائي · هدف التعادل · واتساب",icon:"⚙️"},
 {key:"alerts",title:"التنبيهات اليومية",description:"مراجعة التنبيهات والموازنات المعلقة",icon:"🔔"},
 {key:"links",title:"روابط العمال والصلاحيات",description:"روابط مشتركة للعامل · رابط الإدارة",icon:"🔗"},
 {key:"device",title:"إدارة جهاز المدير",description:"حالة الجهاز وإلغاء ربطه",icon:"📱"},
 {key:"audit",title:"مراجعة البيانات",description:"الاختلافات · استيراد السجلات للمراجعة",icon:"🗂️"},
 {key:"backup",title:"النسخ الاحتياطية",description:"النسخ المشفر والتحقق من سلامته",icon:"🔐"},
];
const validSection=(value:string|null):value is Section=>
 value==="home"||cards.some(x=>x.key===value);
export function SettingsHub({identity}:{identity:AppIdentity}){
 const [section,setSection]=useState<Section>("home");
 const [focusWorker,setFocusWorker]=useState<string|undefined>(undefined);
 const [quickAdd,setQuickAdd]=useState(false);
 const [search,setSearch]=useState("");
 useEffect(()=>{
  const readRoute=()=>{
   const query=new URLSearchParams(window.location.search);
   const wanted=query.get("section");
   setSection(validSection(wanted)?wanted:"home");
   const id=query.get("worker")||"";
   setFocusWorker(/^[a-f0-9-]{36}$/i.test(id)?id:undefined);
   setQuickAdd(query.get("quickAdd")==="1");
  };
  readRoute();window.addEventListener("popstate",readRoute);
  return()=>window.removeEventListener("popstate",readRoute);
 },[]);
 const visible=useMemo(()=>cards.filter(item=>(item.title+" "+item.description).includes(search.trim())),[search]);
 function navigate(next:Section,options?:{worker?:string;quickAdd?:boolean}){
  setSection(next);setFocusWorker(options?.worker);
  setQuickAdd(Boolean(options?.quickAdd));
  try{
   const url=new URL(window.location.href);
   url.searchParams.set("tab","settings");
   if(next==="home")url.searchParams.delete("section");
   else url.searchParams.set("section",next);
   if(options?.worker)url.searchParams.set("worker",options.worker);
   else url.searchParams.delete("worker");
   if(options?.quickAdd)url.searchParams.set("quickAdd","1");
   else url.searchParams.delete("quickAdd");
   window.history.replaceState({tab:"settings"},"",url.pathname+url.search+url.hash);
  }catch{}
 }
 function toRegistration(){
  try{
   const url=new URL(window.location.href);
   url.searchParams.set("tab","car");
   url.searchParams.delete("section");url.searchParams.delete("worker");url.searchParams.delete("quickAdd");
   window.history.pushState({tab:"car"},"",url.pathname+url.search+url.hash);
   window.localStorage.setItem("bright_carwash_manager_last_tab_v3","car");
   window.dispatchEvent(new PopStateEvent("popstate"));
  }catch{}
 }
 const current=cards.find(p=>p.key===section);
 return <div className="space-y-4" dir="rtl" data-testid="settings-control-center">
  <section className="card">
   <div className="flex items-start justify-between gap-3">
    <div>
     <h2 className="section-title mb-1">{section==="home"?"مركز إعدادات المغسلة":current?.title||"الإعدادات"}</h2>
     <p className="txt-muted text-sm">{section==="home"?"تحكم بالتشغيل والعمال والأسعار من مكان واحد.":current?.description}</p>
    </div>
    {section!=="home"&&<button type="button" className="btn-secondary shrink-0 text-sm"
     onClick={()=>navigate("home")} data-testid="settings-back">كل الإعدادات</button>}
   </div>
  </section>
  {section==="home"&&<>
   <div className="grid grid-cols-2 md:grid-cols-3 gap-2" data-testid="settings-quick-actions">
    <button type="button" className="btn-primary py-3" onClick={()=>navigate("workers",{quickAdd:true})}>+ عامل جديد</button>
    <button type="button" className="btn-secondary py-3" onClick={()=>navigate("services")}>تعديل الأسعار</button>
    <button type="button" className="btn-secondary py-3 col-span-2 md:col-span-1" onClick={toRegistration}>+ تسجيل سيارة</button>
   </div>
   <section className="card space-y-3">
    <label className="form-label">ابحث عن إعداد
     <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="مثل: العمال، واتساب، الأسعار، المخزون..."/></label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
     {visible.map(item=><button type="button" key={item.key}
      onClick={()=>navigate(item.key)} className="rounded-xl border p-3 flex gap-3 items-center text-start"
      style={{borderColor:"var(--border)",background:"var(--surface-2)"}}>
      <span className="text-2xl shrink-0" aria-hidden="true">{item.icon}</span>
      <span className="min-w-0 flex-1"><strong className="block text-sm">{item.title}</strong>
       <span className="txt-muted text-xs">{item.description}</span></span>
      <span className="txt-muted text-sm" aria-hidden="true">‹</span>
     </button>)}
     {visible.length===0&&<p className="txt-muted text-sm">لم نجد إعدادًا بهذا الاسم.</p>}
    </div>
   </section>
  </>}
  {section==="workers"&&<WorkerDirectorySettings focusWorkerId={focusWorker} startQuickAdd={quickAdd}/>}
  {section==="services"&&<SettingsTab section="services"/>}
  {section==="operations"&&<SettingsTab section="general"/>}
  {section==="inventory"&&<InventoryTab/>}
  {section==="alerts"&&<AlertsTab isOwner/>}
  {section==="links"&&<UsersTab/>}
  {section==="device"&&<AccountSettings identity={identity}/>}
  {section==="audit"&&<div className="space-y-4"><ReconciliationTab/><ImportSheetSection/></div>}
  {section==="backup"&&<SettingsTab section="backup"/>}
 </div>;
}
