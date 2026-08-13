"use client";

import { useEffect, useState } from "react";
import { applyTheme, getTheme, setTheme, type ThemeChoice } from "@/lib/theme";

const CHOICES: { value: ThemeChoice; label: string; title: string }[] = [
  { value: "auto", label: "تلقائي", title: "يتبع إعداد الجهاز" },
  { value: "light", label: "فاتح", title: "وضع فاتح دائماً" },
  { value: "dark", label: "داكن", title: "وضع داكن دائماً" },
];

export function ModeSwitch({
  mode,
  onRequestOwner,
  onLeaveOwner,
}: {
  mode: "worker" | "owner";
  onRequestOwner: () => void;
  onLeaveOwner: () => void;
}) {
  const [theme, setThemeState] = useState<ThemeChoice>("auto");

  useEffect(() => {
    const current = getTheme();
    setThemeState(current);
    applyTheme(current);
  }, []);

  function choose(choice: ThemeChoice) {
    setThemeState(choice);
    setTheme(choice);
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <button
        type="button"
        className="theme-switch-btn is-active"
        onClick={mode === "owner" ? onLeaveOwner : onRequestOwner}
      >
        {mode === "owner" ? "↩ رجوع لوضع الموظف" : "⚙ وضع المالك"}
      </button>

      <div className="theme-switch" role="group" aria-label="مظهر الواجهة">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.title}
            aria-pressed={theme === c.value}
            className={`theme-switch-btn ${theme === c.value ? "is-active" : ""}`}
            onClick={() => choose(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
