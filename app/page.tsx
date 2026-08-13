"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { CarEntryTab } from "./components/CarEntryTab";
import { ExpensesTab } from "./components/ExpensesTab";
import { AnalysisTab } from "./components/AnalysisTab";
import { OfflineStatusBadge } from "./components/OfflineStatusBadge";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorMonitor } from "./components/ErrorMonitor";

type Tab = "car" | "expenses" | "analysis";

export default function Home() {
  const [tab, setTab] = useState<Tab>("car");

  return (
    <ErrorBoundary>
      <ErrorMonitor />
      <div className="app-shell">
        <header className="app-header">
          <h1 className="text-2xl sm:text-3xl font-extrabold">لوحة التحكم الرئيسية</h1>
          <p className="text-sm sm:text-base opacity-90 mt-1">نظام موحد لإدارة السيارات والمصروفات وتحليل الأداء</p>
        </header>

        <nav className="tabs-bar">
          <button type="button" className={`tab-button ${tab === "car" ? "active" : ""}`} onClick={() => setTab("car")}>
            🚗 تسجيل السيارات
          </button>
          <button type="button" className={`tab-button ${tab === "expenses" ? "active" : ""}`} onClick={() => setTab("expenses")}>
            💳 المصروفات
          </button>
          <button type="button" className={`tab-button ${tab === "analysis" ? "active" : ""}`} onClick={() => setTab("analysis")}>
            📊 تحليل البيانات
          </button>
        </nav>

        <div className="content-section-wrapper">
          {tab === "car" && <CarEntryTab />}
          {tab === "expenses" && <ExpensesTab />}
          {tab === "analysis" && <AnalysisTab />}
        </div>

        <div id="toast-container" />
        <OfflineStatusBadge />
        <ServiceWorkerRegister />
      </div>
    </ErrorBoundary>
  );
}
