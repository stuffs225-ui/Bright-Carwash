"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { applyMode, getMode, setMode as persistMode, type AppMode } from "@/lib/theme";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/lib/settings";
import { CarEntryTab } from "./components/CarEntryTab";
import { ExpensesTab } from "./components/ExpensesTab";
import { AnalysisTab } from "./components/AnalysisTab";
import { SettingsTab } from "./components/SettingsTab";
import { OfflineStatusBadge } from "./components/OfflineStatusBadge";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorMonitor } from "./components/ErrorMonitor";
import { ModeSwitch } from "./components/ModeSwitch";
import { OwnerPinPrompt } from "./components/OwnerPinPrompt";

type Tab = "car" | "expenses" | "analysis" | "settings";

export default function Home() {
  const [tab, setTab] = useState<Tab>("car");
  const [mode, setModeState] = useState<AppMode>("worker");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [askPin, setAskPin] = useState(false);

  useEffect(() => {
    const current = getMode();
    setModeState(current);
    applyMode(current);
    loadSettings().then(setSettings);
  }, []);

  function switchTo(next: AppMode) {
    setModeState(next);
    persistMode(next);
    if (next === "worker") setTab("car");
  }

  function requestOwner() {
    if (settings.owner_pin) {
      setAskPin(true);
      return;
    }
    switchTo("owner");
  }

  const isOwner = mode === "owner";

  return (
    <ErrorBoundary>
      <ErrorMonitor />
      <div className="app-shell">
        <header className="app-header">
          <ModeSwitch
            mode={mode}
            onRequestOwner={requestOwner}
            onLeaveOwner={() => switchTo("worker")}
          />
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">
            {isOwner ? "لوحة التحكم الرئيسية" : "تسجيل السيارات"}
          </h1>
          <p className="text-sm sm:text-base opacity-90 mt-1">
            {isOwner
              ? "نظام موحد لإدارة السيارات والمصروفات وتحليل الأداء"
              : "سجّل السيارة بضغطة — الأزرار السريعة بالأعلى"}
          </p>
        </header>

        {isOwner && (
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
            <button type="button" className={`tab-button ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
              ⚙ الإعدادات
            </button>
          </nav>
        )}

        <div className={`content-section-wrapper ${isOwner ? "" : "is-standalone"}`}>
          {tab === "car" && <CarEntryTab ownerView={isOwner} />}
          {isOwner && tab === "expenses" && <ExpensesTab />}
          {isOwner && tab === "analysis" && <AnalysisTab />}
          {isOwner && tab === "settings" && <SettingsTab />}
        </div>

        {askPin && (
          <OwnerPinPrompt
            expectedPin={settings.owner_pin}
            onUnlock={() => { setAskPin(false); switchTo("owner"); }}
            onCancel={() => setAskPin(false)}
          />
        )}

        <div id="toast-container" />
        <OfflineStatusBadge />
        <ServiceWorkerRegister />
      </div>
    </ErrorBoundary>
  );
}
