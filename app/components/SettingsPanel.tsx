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
  const [startHour, setStartHour] = useState(String(settings.shift_start_hour));
  const [endHour, setEndHour] = useState(String(settings.shift_end_hour));
  const [backupEmail, setBackupEmail] = useState(settings.backup_email);
  const [backupIntervalDays, setBackupIntervalDays] = useState(String(settings.backup_interval_days));

  return (
    <div className="mt-5 border-t pt-4 text-right">
      <h4 className="subsection-title">إعدادات الوردية والمكافأة</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">حد سيارات الوردية للمكافأة</label>
          <input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
        <div>
          <label className="form-label">مكافأة كل سيارة زايدة (ر.س)</label>
          <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div>
          <label className="form-label">بداية الوردية (الساعة 0-23)</label>
          <input type="number" min="0" max="23" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
        </div>
        <div>
          <label className="form-label">نهاية الوردية (الساعة 0-23)</label>
          <input type="number" min="0" max="23" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
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
              shift_start_hour: Number(startHour) || 0,
              shift_end_hour: Number(endHour) || 0,
              backup_email: backupEmail,
              backup_interval_days: Number(backupIntervalDays) || 1,
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
