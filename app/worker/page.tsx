"use client";
export const dynamic = "force-dynamic";
import { AuthGate } from "../components/AuthGate";
import { CarEntryTab } from "../components/CarEntryTab";
import { OfflineStatusBadge } from "../components/OfflineStatusBadge";
import { ServiceWorkerRegister } from "../components/ServiceWorkerRegister";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ErrorMonitor } from "../components/ErrorMonitor";
import { supabase } from "@/lib/supabaseClient";
import { queueLength } from "@/lib/offlineQueue";

export default function WorkerPage() {
  return <AuthGate>{(identity) => (
    <ErrorBoundary>
      <ErrorMonitor />
      <div className="app-shell" dir="rtl">
        <header className="app-header">
          <h1 className="text-2xl font-extrabold">🚗 تسجيل السيارات</h1>
          <p className="text-sm mt-1">المستخدم: {identity.email}</p>
          <button type="button" className="btn-secondary mt-3" onClick={async () => {
            if (queueLength()) { alert("زامن التسجيلات المحفوظة محليًا قبل الخروج."); return; }
            await supabase.auth.signOut();
          }}>تسجيل الخروج</button>
        </header>
        <div className="content-section-wrapper is-standalone"><CarEntryTab ownerView={false} /></div>
        <div id="toast-container" />
        <OfflineStatusBadge />
        <ServiceWorkerRegister />
      </div>
    </ErrorBoundary>
  )}</AuthGate>;
}