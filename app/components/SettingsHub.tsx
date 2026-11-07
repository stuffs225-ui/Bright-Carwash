"use client";
import {useState} from "react";
import {SettingsTab} from "./SettingsTab";
import {AlertsTab} from "./AlertsTab";
import {ReconciliationTab} from "./ReconciliationTab";
import {UsersTab} from "./UsersTab";
type Section="general"|"services"|"alerts"|"audit"|"links"|"backup";
const pages:{key:Section;title:string}[]=[
 {key:"general",title:"الإعدادات العامة"},
 {key:"services",title:"الخدمات والأسعار"},
 {key:"alerts",title:"التنبيهات"},
 {key:"audit",title:"تدقيق البيانات"},
 {key:"links",title:"روابط العمال"},
 {key:"backup",title:"النسخ الاحتياطي"},
];
export function SettingsHub(){
 const [section,setSection]=useState<Section>("general");
 return <div className="space-y-4">
  <nav className="carwash-inner-tabs" aria-label="إعدادات المغسلة">
   {pages.map(p=><button type="button" key={p.key}
    className={p.key===section?"active":""}
    aria-current={p.key===section?"page":undefined}
    onClick={()=>setSection(p.key)}>{p.title}</button>)}
  </nav>
  {section==="general"&&<SettingsTab section="general"/>}
  {section==="services"&&<SettingsTab section="services"/>}
  {section==="alerts"&&<AlertsTab isOwner/>}
  {section==="audit"&&<ReconciliationTab/>}
  {section==="links"&&<UsersTab/>}
  {section==="backup"&&<SettingsTab section="backup"/>}
 </div>;
}
