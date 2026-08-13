"use client";

import { useState } from "react";
import type { AppSettings } from "@/lib/settings";

export function SettingsPanel({
  settings,
  onSave,
  onClose,
}: {
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}) {
  const [threshold, setThreshold] = useState(String(settings.shift_car_threshold));
  const [rate, setRate] = useState(String(settings.worker_bonus_rate));
  const [backupEmail, setBackupEmail] = useState(settings.backup_email);
  const [backupIntervalDays, setBackupIntervalDays] = useState(String(settings.backup_interval_days));
  const [dailyTarget, setDailyTarget] = useState(String(settings.daily_expense_target));
  const [ownerPin, setOwnerPin] = useState(settings.owner_pin);

  return (
    <div className="mt-5 border-t pt-4 text-right">
      <h4 className="subsection-title">إعدادات المكافأة</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">حد سيارات الوردية للمكافأة</label>
          <input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
        <div>
          <label className="form-label">مكافأة كل سيارة زايدة (ر.س)</label>
          <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
      </div>

      <h4 className="subsection-title mt-5">هدف اليوم وقفل وضع المالك</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">مصروف اليوم المستهدف (0 = احسبه تلقائياً)</label>
          <input type="number" min="0" step="0.01" value={dailyTarget} onChange={(e) => setDailyTarget(e.target.value)} />
        </div>
        <div>
          <label className="form-label">رقم سري لوضع المالك (فارغ = بدون قفل)</label>
          <input type="text" inputMode="numeric" value={ownerPin} onChange={(e) => setOwnerPin(e.target.value)} />
        </div>
      </div>

      <h4 className="subsection-title mt-5">النسخة الاحتياطية بالإيميل</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">الإيميل المستقبل</label>
          <input type="email" value={backupEmail} onChange={(e) => setBackupEmail(e.target.value)} />
        </div>
        <div>
          <label className="form-label">عدد الأيام بين كل نسخة</label>
          <input type="number" min="1" value={backupIntervalDays} onChange={(e) => setBackupIntervalDays(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          className="btn-primary"
          onClick={() =>
            onSave({
              shift_car_threshold: Number(threshold) || 0,
              worker_bonus_rate: Number(rate) || 0,
              backup_email: backupEmail,
              backup_interval_days: Number(backupIntervalDays) || 1,
              daily_expense_target: Number(dailyTarget) || 0,
              owner_pin: ownerPin,
            })
          }
        >
          حفظ الإعدادات
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}
