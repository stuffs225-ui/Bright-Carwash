"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { CarEntryTab } from "../components/CarEntryTab";
import { OfflineStatusBadge } from "../components/OfflineStatusBadge";
import { ServiceWorkerRegister } from "../components/ServiceWorkerRegister";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ErrorMonitor } from "../components/ErrorMonitor";

export default function WorkerPage() {
  // هذي الصفحة دائماً بوضع اللمس، بغض النظر عن الوضع المحفوظ بالجهاز
  useEffect(() => {
    document.documentElement.classList.add("touch-mode");
  }, []);

  return (
    <ErrorBoundary>
      <ErrorMonitor />
      <div className="app-shell">
        <header className="app-header">
          <h1 className="text-2xl sm:text-3xl font-extrabold">تسجيل السيارات</h1>
          <p className="text-sm sm:text-base opacity-90 mt-1">سجّل السيارة بضغطة — الأزرار السريعة بالأعلى</p>
        </header>

        <div className="content-section-wrapper is-standalone">
          <CarEntryTab ownerView={false} />
        </div>

        <div id="toast-container" />
        <OfflineStatusBadge />
        <ServiceWorkerRegister />
      </div>
    </ErrorBoundary>
  );
}
