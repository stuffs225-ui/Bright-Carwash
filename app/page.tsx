"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { queueLength } from "@/lib/offlineQueue";
import { AuthGate, type AppIdentity } from "./components/AuthGate";
import { CarEntryTab } from "./components/CarEntryTab";
import { ExpensesTab } from "./components/ExpensesTab";
import { AnalysisTab } from "./components/AnalysisTab";
import { WorkersTab } from "./components/WorkersTab";
import { SettingsTab } from "./components/SettingsTab";
import { UsersTab } from "./components/UsersTab";
import { AlertsTab } from "./components/AlertsTab";
import { ReconciliationTab } from "./components/ReconciliationTab";
import { CrewBonusesTab } from "./components/CrewBonusesTab";
import { AccountingMonthsTab } from "./components/AccountingMonthsTab";
import { ShiftCloseTab } from "./components/ShiftCloseTab";
import { OfflineStatusBadge } from "./components/OfflineStatusBadge";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorMonitor } from "./components/ErrorMonitor";

type Tab = "car" | "settlement" | "expenses" | "analysis" | "workers" | "crewbonus" | "months" | "settings" | "users" | "alerts" | "reconciliation";
const NAV: { key: Tab; label: string; allowed: ("owner" | "manager" | "worker")[] }[] = [
  { key: "car", label: "🚗 تسجيل السيارات", allowed: ["owner","worker"] },
  { key: "settlement", label: "🧾 موازنة الوردية", allowed: ["owner","manager"] },
  { key: "expenses", label: "💳 المصروفات", allowed: ["owner","manager"] },
  { key: "analysis", label: "📊 التحليلات", allowed: ["owner","manager"] },
  { key: "workers", label: "👷 العمال", allowed: ["owner","manager"] },
  { key: "crewbonus", label: "⭐ مكافآت الوردية", allowed: ["owner","manager"] },
  { key: "months", label: "🗓️ اعتماد الشهور", allowed: ["owner"] },
  { key: "settings", label: "⚙ الإعدادات", allowed: ["owner"] },
  { key: "users", label: "🔐 المستخدمون", allowed: ["owner"] },
  { key: "alerts", label: "🔔 التنبيهات", allowed: ["owner","manager"] },
  { key: "reconciliation", label: "🧾 تدقيق الترحيل", allowed: ["owner"] },
];

function CarwashApp({ identity }: { identity: AppIdentity }) {
  const [tab, setTab] = useState<Tab>(identity.role==="manager"?"settlement":"car");
  const permitted = NAV.filter((item) => item.allowed.includes(identity.role));
  const actualTab = permitted.some((t) => t.key === tab) ? tab : (identity.role==="manager"?"settlement":"car");
  const isOwner = identity.role === "owner";
  const canManage = identity.role === "owner" || identity.role === "manager";

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
            {identity.role === "owner" ? "لوحة المالك" : identity.role === "manager" ? "إدارة المغسلة" : "تسجيل السيارات"}
          </p>
          <div className="flex items-center justify-center gap-3 mt-3 text-sm">
            <span>{identity.email}</span>
            <button type="button" className="btn-secondary" onClick={logout}>تسجيل الخروج</button>
          </div>
        </header>
        <nav className="tabs-bar" aria-label="القائمة الرئيسية">
          {permitted.map(({key,label}) =>
            <button key={key} type="button" className={`tab-button ${actualTab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</button>
          )}
        </nav>
        <div className="content-section-wrapper">
          {actualTab === "car" && <CarEntryTab ownerView={isOwner} />}
          {canManage && actualTab === "settlement" && <ShiftCloseTab isOwner={isOwner} />}
          {canManage && actualTab === "expenses" && <ExpensesTab />}
          {canManage && actualTab === "analysis" && <AnalysisTab />}
          {canManage && actualTab === "workers" && <WorkersTab />}
          {canManage && actualTab === "crewbonus" && <CrewBonusesTab />}
          {isOwner && actualTab === "months" && <AccountingMonthsTab />}
          {isOwner && actualTab === "settings" && <SettingsTab />}
          {isOwner && actualTab === "users" && <UsersTab />}
          {canManage && actualTab === "alerts" && <AlertsTab isOwner={isOwner} />}
          {isOwner && actualTab === "reconciliation" && <ReconciliationTab />}
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