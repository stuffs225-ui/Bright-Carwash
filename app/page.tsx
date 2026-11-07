"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { AuthGate, type AppIdentity } from "./components/AuthGate";
import { ExpensesTab } from "./components/ExpensesTab";
import { AnalysisTab } from "./components/AnalysisTab";
import { WorkersTab } from "./components/WorkersTab";
import { SettingsTab } from "./components/SettingsTab";
import { UsersTab } from "./components/UsersTab";
import { AlertsTab } from "./components/AlertsTab";
import { ReconciliationTab } from "./components/ReconciliationTab";
import { CrewBonusesTab } from "./components/CrewBonusesTab";
import { AccountingMonthsTab } from "./components/AccountingMonthsTab";
import { CarEntryTab } from "./components/CarEntryTab";
import { DaySettlementTab } from "./components/DaySettlementTab";
import { OfflineStatusBadge } from "./components/OfflineStatusBadge";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorMonitor } from "./components/ErrorMonitor";


type Tab = "car" | "settlement" | "expenses" | "analysis" | "workers" | "crewbonus" | "months" | "settings" | "users" | "alerts" | "reconciliation";
type Group="overview"|"operations"|"finance"|"management";
const GROUPS:{key:Group;label:string;items:{key:Tab;label:string}[]}[]=[
 {key:"overview",label:"📊 الرئيسية",items:[
  {key:"analysis",label:"لوحة المؤشرات"},{key:"alerts",label:"التنبيهات"}]},
 {key:"operations",label:"🚗 التشغيل",items:[
  {key:"car",label:"تسجيل السيارات"},{key:"settlement",label:"موازنة الأيام"}]},
 {key:"finance",label:"💰 المالية",items:[
  {key:"expenses",label:"المصروفات"},{key:"workers",label:"العمال والرواتب"},
  {key:"crewbonus",label:"مكافآت الفريق"},{key:"months",label:"تقارير الشهور"}]},
 {key:"management",label:"⚙️ الإدارة",items:[
  {key:"users",label:"رابط العامل"},{key:"settings",label:"الإعدادات"},{key:"reconciliation",label:"تدقيق الأرشيف"}]}
];
function CarwashApp({identity}:{identity:AppIdentity}){
 const [tab,setTab]=useState<Tab>("analysis");
 const group=GROUPS.find(g=>g.items.some(i=>i.key===tab))||GROUPS[0];
 return <ErrorBoundary>
  <ErrorMonitor />
  <div className="app-shell" dir="rtl">
   <header className="app-header">
    <h1 className="text-2xl sm:text-3xl font-extrabold">مغسلة سيارتك اللامعة</h1>
    <p className="text-sm opacity-90 mt-2">لوحة الإدارة — تسجيل السيارات ومتابعة التشغيل والحسابات</p>
    <p className="text-xs opacity-80 mt-2">هذا الجهاز معتمد للإدارة</p>
   </header>
   <nav className="manager-groups" aria-label="الأقسام الرئيسية">
    {GROUPS.map(g=><button key={g.key} type="button" className="manager-group-button"
     aria-pressed={g.key===group.key} onClick={()=>setTab(g.items[0].key)}>{g.label}</button>)}
   </nav>
   <nav className="manager-sections" aria-label="صفحات القسم">
    {group.items.map(item=><button key={item.key} type="button" className="manager-section-button"
      aria-current={tab===item.key?"page":undefined}
      onClick={()=>setTab(item.key)}>{item.label}</button>)}
   </nav>
   <div className="content-section-wrapper">
    {tab==="car"&&<CarEntryTab ownerView/>}
    {tab==="settlement"&&<DaySettlementTab canApproveVariance/>}
    {tab==="expenses"&&<ExpensesTab/>}
    {tab==="analysis"&&<AnalysisTab/>}
    {tab==="workers"&&<WorkersTab/>}
    {tab==="crewbonus"&&<CrewBonusesTab/>}
    {tab==="months"&&<AccountingMonthsTab/>}
    {tab==="settings"&&<SettingsTab/>}
    {tab==="users"&&<UsersTab/>}
    {tab==="alerts"&&<AlertsTab isOwner/>}
    {tab==="reconciliation"&&<ReconciliationTab/>}
   </div>
   <div id="toast-container"/>
   <OfflineStatusBadge/>
   <ServiceWorkerRegister/>
  </div>
 </ErrorBoundary>;
}
export default function Home() {
  return <AuthGate>{identity => <CarwashApp identity={identity} />}</AuthGate>;
}