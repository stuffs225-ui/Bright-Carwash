"use client";

import { formatCurrency } from "@/lib/business";
import { t, type Lang } from "@/lib/i18n";
import type { EntryPreset } from "@/lib/types";

export function PresetGrid({
  presets,
  disabled,
  onPick,
  lang = "ar",
}: {
  presets: EntryPreset[];
  disabled?: boolean;
  onPick: (preset: EntryPreset, method: "cash" | "card") => void;
  lang?: Lang;
}) {
  if (!presets.length) return null;

  return (
    <div className="preset-grid">
      {presets.map((p) => (
        <div key={p.id} className="preset-tile">
          <div className="preset-head">
            <div className="preset-combo">
              {p.car_type} · {p.service_type}
            </div>
            <div className="preset-price">{formatCurrency(p.amount)}</div>
          </div>
          <div className="preset-actions">
            <button
              type="button"
              className="preset-pay is-cash"
              disabled={disabled}
              onClick={() => onPick(p, "cash")}
            >
              {t(lang, "كاش")}
            </button>
            <button
              type="button"
              className="preset-pay is-card"
              disabled={disabled}
              onClick={() => onPick(p, "card")}
            >
              {t(lang, "بطاقة")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
