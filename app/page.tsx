"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { queueLength } from "@/lib/offlineQueue";
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
import { WorkerRegisterTab } from "./components/WorkerRegisterTab";
import { DaySettlementTab } from "./components/DaySettlementTab";
import { OfflineStatusBadge } from "./components/OfflineStatusBadge";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import { InstallAppButton } from "./components/InstallAppButton";
import { AccountSettings } from "./components/AccountSettings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorMonitor } from "./components/ErrorMonitor";

type Tab = "car" | "settlement" | "expenses" | "analysis" | "workers" | "crewbonus" | "months" | "settings" | "users" | "alerts" | "reconciliation" | "account";
const NAV: { key: Tab; label: string; allowed: ("manager" | "worker")[] }[] = [
  { key: "car", label: "🚗 تسجيل السيارات", allowed: ["worker"] },
  { key: "settlement", label: "🧾 موازنة الأيام", allowed: ["manager"] },
  { key: "expenses", label: "💳 المصروفات", allowed: ["manager"] },
  { key: "analysis", label: "📊 اللوحة الرئيسية", allowed: ["manager"] },
  { key: "workers", label: "👷 العمال والرواتب", allowed: ["manager"] },
  { key: "crewbonus", label: "⭐ مكافآت العاملين", allowed: ["manager"] },
  { key: "months", label: "🗓️ تقارير الشهور", allowed: ["manager"] },
  { key: "settings", label: "⚙ الإعدادات", allowed: ["manager"] },
  { key: "users", label: "📱 حساب العامل", allowed: ["manager"] },
  { key: "alerts", label: "🔔 التنبيهات", allowed: ["manager"] },
  { key: "reconciliation", label: "🧾 تدقيق البيانات", allowed: ["manager"] },
  { key: "account", label: "👤 معلومات الحساب", allowed: ["manager","worker"] },
];

function CarwashApp({ identity }: { identity: AppIdentity }) {
  const [tab, setTab] = useState<Tab>(identity.role==="manager"?"analysis":"car");
  const permitted = NAV.filter((item) => item.allowed.includes(identity.role));
  const actualTab = permitted.some((t) => t.key === tab) ? tab : (identity.role==="manager"?"analysis":"car");
  const canManage = identity.role === "manager";

  async function logout() {
    if (queueLength() > 0) {
      alert("يوجد تسجيلات غير متزامنة. أعد الاتصال بالإنترنت قبل الخروج.");
      return;
    }
    await supabase.auth.signOut({ scope: "local" });
  }

  return (
    <ErrorBoundary>
      <ErrorMonitor />
      <div className="app-shell" dir="rtl">
        <header className="app-header">
          <h1 className="text-2xl sm:text-3xl font-extrabold">مغسلة سيارتك اللامعة</h1>
          <p className="text-sm opacity-90 mt-2">
            {identity.role==="manager"?"لوحة المدير — الإدارة الشاملة":"تسجيل السيارات — العامل"}
          </p>
          <div className="flex items-center justify-center gap-3 mt-3 text-sm">
            <span>{identity.email}</span>
            <button type="button" className="btn-secondary" onClick={logout}>تسجيل الخروج</button>
            {identity.role==="worker"&&<InstallAppButton />}
          </div>
        </header>
        <nav className="tabs-bar" aria-label="القائمة الرئيسية">
          {permitted.map(({key,label}) =>
            <button key={key} type="button" className={`tab-button ${actualTab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</button>
          )}
        </nav>
        <div className="content-section-wrapper">
          {actualTab === "car" && <WorkerRegisterTab/>}
          {canManage && actualTab === "settlement" && <DaySettlementTab canApproveVariance />}
          {canManage && actualTab === "expenses" && <ExpensesTab />}
          {canManage && actualTab === "analysis" && <AnalysisTab />}
          {canManage && actualTab === "workers" && <WorkersTab />}
          {canManage && actualTab === "crewbonus" && <CrewBonusesTab />}
          {canManage && actualTab === "months" && <AccountingMonthsTab />}
          {canManage && actualTab === "settings" && <SettingsTab />}
          {canManage && actualTab === "users" && <UsersTab />}
          {canManage && actualTab === "alerts" && <AlertsTab isOwner={canManage} />}
          {canManage && actualTab === "reconciliation" && <ReconciliationTab />}
          {actualTab === "account" && <AccountSettings identity={identity} />}
        </div>
        <div id="toast-container" />
        <OfflineStatusBadge />
        <ServiceWorkerRegister />
      </div>
    </ErrorBoundary>
  );
}
export default function Home() {
  return <AuthGate>{identity => <CarwashApp identity={identity} />}</AuthGate>;
}