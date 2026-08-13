"use client";

import { formatCurrency } from "@/lib/business";
import type { EntryPreset } from "@/lib/types";

export function PresetGrid({
  presets,
  disabled,
  onPick,
}: {
  presets: EntryPreset[];
  disabled?: boolean;
  onPick: (preset: EntryPreset, method: "cash" | "card") => void;
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
              كاش
            </button>
            <button
              type="button"
              className="preset-pay is-card"
              disabled={disabled}
              onClick={() => onPick(p, "card")}
            >
              بطاقة
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
