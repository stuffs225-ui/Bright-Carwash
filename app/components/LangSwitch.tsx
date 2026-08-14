"use client";

import type { Lang } from "@/lib/i18n";

// زر بسيط لتبديل لغة صفحة تسجيل السيارات فقط (عربي/إنجليزي) — لعامل يفضّل
// يشتغل بالإنجليزي. باقي النظام يبقى عربي دائماً.
export function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  const next = lang === "ar" ? "en" : "ar";
  return (
    <button type="button" className="theme-switch-btn is-active" onClick={() => onChange(next)}>
      {lang === "ar" ? "English" : "عربي"}
    </button>
  );
}
