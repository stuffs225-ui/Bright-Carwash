"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { CarEntryTab } from "../components/CarEntryTab";
import { OfflineStatusBadge } from "../components/OfflineStatusBadge";
import { ServiceWorkerRegister } from "../components/ServiceWorkerRegister";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ErrorMonitor } from "../components/ErrorMonitor";
import { ThemeSwitch } from "../components/ModeSwitch";
import { getLang, t, type Lang } from "@/lib/i18n";

export default function WorkerPage() {
  // هذي الصفحة دائماً بوضع اللمس، بغض النظر عن الوضع المحفوظ بالجهاز
  useEffect(() => {
    document.documentElement.classList.add("touch-mode");
  }, []);

  // ترويسة الصفحة مستقلة عن CarEntryTab، فنستمع لتغيّر اللغة من زر التبديل
  // الموجود داخل CarEntryTab عشان العنوان يتزامن معه بنفس اللحظة.
  const [lang, setLangState] = useState<Lang>("ar");
  useEffect(() => {
    setLangState(getLang());
    const handler = (e: Event) => setLangState((e as CustomEvent<Lang>).detail);
    window.addEventListener("carwash-lang-changed", handler);
    return () => window.removeEventListener("carwash-lang-changed", handler);
  }, []);

  return (
    <ErrorBoundary>
      <ErrorMonitor />
      <div className="app-shell">
        <header className="app-header" dir={lang === "en" ? "ltr" : "rtl"}>
          <ThemeSwitch />
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">{t(lang, "تسجيل السيارات")}</h1>
          <p className="text-sm sm:text-base opacity-90 mt-1">{t(lang, "سجّل السيارة بضغطة — الأزرار السريعة بالأعلى")}</p>
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
