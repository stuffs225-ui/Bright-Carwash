"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/business";
import { showToast } from "@/lib/toast";
import { DEFAULT_SETTINGS, loadSettings, updateSetting, type AppSettings } from "@/lib/settings";
import { createPreset, deletePreset, loadPresets } from "@/lib/presets";
import { addLookup, loadLookup, renameLookup, setLookupActive, type LookupRow, type LookupTable } from "@/lib/lookups";
import type { EntryPreset } from "@/lib/types";
import { applyTheme, getTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import { ImportSheetSection } from "./ImportSheetSection";

export function SettingsTab() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  const [threshold, setThreshold] = useState("");
  const [rate, setRate] = useState("");
  const [dailyTarget, setDailyTarget] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [backupEmail, setBackupEmail] = useState("");
  const [backupDays, setBackupDays] = useState("");

  const [presets, setPresets] = useState<EntryPreset[]>([]);
  const [theme, setThemeState] = useState<ThemeChoice>("auto");
  const [workerUrl, setWorkerUrl] = useState("");

  const hydrate = useCallback((s: AppSettings) => {
    setSettings(s);
    setThreshold(String(s.shift_car_threshold));
    setRate(String(s.worker_bonus_rate));
    setDailyTarget(String(s.daily_expense_target));
    setOwnerPin(s.owner_pin);
    setBackupEmail(s.backup_email);
    setBackupDays(String(s.backup_interval_days));
  }, []);

  useEffect(() => {
    loadSettings().then(hydrate);
    loadPresets().then(setPresets);
    setThemeState(getTheme());
    setWorkerUrl(`${window.location.origin}/worker`);
  }, [hydrate]);

  async function save(patch: Partial<AppSettings>) {
    setSaving(true);
    const next = { ...settings, ...patch };
    for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
      await updateSetting(key, next[key]);
    }
    setSettings(next);
    setSaving(false);
    showToast("تم الحفظ.");
  }

  function chooseTheme(choice: ThemeChoice) {
    setThemeState(choice);
    setTheme(choice);
    applyTheme(choice);
  }

  async function copyWorkerUrl() {
    try {
      await navigator.clipboard.writeText(workerUrl);
      showToast("تم نسخ الرابط.");
    } catch {
      showToast("ما قدرت أنسخ تلقائياً — حدّد الرابط وانسخه يدوياً.", "warning");
    }
  }

  return (
    <div className="space-y-6">
      <Section title="المكافأة" hint="تُحسب على عدد سيارات اليوم كاملاً (من منتصف الليل لمنتصف الليل).">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="حد السيارات للمكافأة">
            <input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
          <Field label="مكافأة كل سيارة زائدة (ر.س)">
            <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        </div>
        <SaveButton
          disabled={saving}
          onClick={() => save({ shift_car_threshold: Number(threshold) || 0, worker_bonus_rate: Number(rate) || 0 })}
        />
        <p className="txt-muted text-sm mt-2">
          مثال: لو الحد {threshold || 0} والمكافأة {rate || 0} ريال، فعند {Number(threshold) + 5 || 5} سيارة
          يستحق كل عامل {formatCurrency((Number(rate) || 0) * 5)}.
        </p>
      </Section>

      <Section title="هدف التعادل اليومي" hint="عدد السيارات اللي تغطي مصروف اليوم. اتركه صفراً ليُحسب تلقائياً من آخر 90 يوم.">
        <Field label="مصروف اليوم المستهدف (0 = تلقائي)">
          <input type="number" min="0" step="0.01" value={dailyTarget} onChange={(e) => setDailyTarget(e.target.value)} />
        </Field>
        <SaveButton disabled={saving} onClick={() => save({ daily_expense_target: Number(dailyTarget) || 0 })} />
      </Section>

      <Section title="رابط الموظف" hint="افتح هذا الرابط على تابلت المغسلة — يعرض تسجيل السيارات فقط بأزرار كبيرة.">
        <div className="flex flex-wrap gap-2 items-center">
          <input type="text" readOnly value={workerUrl} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn-primary" onClick={copyWorkerUrl}>نسخ الرابط</button>
        </div>
        <p className="txt-warning text-sm mt-2">
          تنبيه: الرابط للتسهيل مو للحماية — الموظف يقدر يكتب العنوان الرئيسي ويوصل لوضع المالك.
          لو تبي منع ذلك، فعّل الرقم السري تحت.
        </p>
      </Section>

      <Section title="قفل وضع المالك" hint="اتركه فارغاً لتعطيل القفل.">
        <Field label="الرقم السري">
          <input type="text" inputMode="numeric" value={ownerPin} onChange={(e) => setOwnerPin(e.target.value)} />
        </Field>
        <SaveButton disabled={saving} onClick={() => save({ owner_pin: ownerPin })} />
      </Section>

      <Section title="النسخة الاحتياطية بالإيميل">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الإيميل المستقبل">
            <input type="email" value={backupEmail} onChange={(e) => setBackupEmail(e.target.value)} />
          </Field>
          <Field label="عدد الأيام بين كل نسخة">
            <input type="number" min="1" value={backupDays} onChange={(e) => setBackupDays(e.target.value)} />
          </Field>
        </div>
        <SaveButton
          disabled={saving}
          onClick={() => save({ backup_email: backupEmail, backup_interval_days: Number(backupDays) || 1 })}
        />
      </Section>

      <Section title="المظهر">
        <div className="flex flex-wrap gap-2">
          {(["auto", "light", "dark"] as ThemeChoice[]).map((c) => (
            <button
              key={c}
              type="button"
              className={theme === c ? "btn-primary" : "btn-secondary"}
              onClick={() => chooseTheme(c)}
            >
              {c === "auto" ? "تلقائي" : c === "light" ? "فاتح" : "داكن"}
            </button>
          ))}
        </div>
      </Section>

      <PresetsSection presets={presets} onChanged={() => loadPresets().then(setPresets)} />

      <ImportSheetSection />

      <LookupSection table="car_types" title="أنواع السيارات" />
      <LookupSection table="service_types" title="أنواع الخدمات" />
      <LookupSection table="expense_types" title="أنواع المصروفات" />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="section-title mb-1">{title}</h2>
      {hint && <p className="txt-muted text-sm mb-4">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function SaveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn-primary mt-4" onClick={onClick} disabled={disabled}>
      حفظ
    </button>
  );
}

function PresetsSection({ presets, onChanged }: { presets: EntryPreset[]; onChanged: () => void }) {
  const [carType, setCarType] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [amount, setAmount] = useState("");

  async function add() {
    if (!carType.trim() || !serviceType.trim() || Number(amount) <= 0) {
      showToast("عبّي نوع السيارة والخدمة ومبلغاً أكبر من صفر.", "warning");
      return;
    }
    await createPreset({
      car_type: carType.trim(),
      service_type: serviceType.trim(),
      amount: Number(amount),
      sort_order: presets.length + 1,
    });
    setCarType(""); setServiceType(""); setAmount("");
    showToast("تمت إضافة الزر.");
    onChanged();
  }

  async function remove(id: string) {
    if (!confirm("حذف هذا الزر السريع؟")) return;
    await deletePreset(id);
    showToast("تم الحذف.");
    onChanged();
  }

  return (
    <Section title="أزرار التسجيل السريع" hint="الأزرار اللي تظهر فوق نموذج الإدخال — ضغطة واحدة تسجّل العملية.">
      <div className="overflow-x-auto mb-4">
        <table className="app-table">
          <thead>
            <tr><th>السيارة</th><th>الخدمة</th><th>السعر</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            {presets.length === 0 ? (
              <tr><td colSpan={4} className="text-center txt-muted py-5">لا توجد أزرار.</td></tr>
            ) : (
              presets.map((p) => (
                <tr key={p.id}>
                  <td data-label="السيارة">{p.car_type}</td>
                  <td data-label="الخدمة">{p.service_type}</td>
                  <td data-label="السعر">{formatCurrency(p.amount)}</td>
                  <td className="flex gap-1.5">
                    <button type="button" className="action-button delete-button" onClick={() => remove(p.id)}>حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="نوع السيارة"><input type="text" value={carType} onChange={(e) => setCarType(e.target.value)} /></Field>
        <Field label="نوع الخدمة"><input type="text" value={serviceType} onChange={(e) => setServiceType(e.target.value)} /></Field>
        <Field label="السعر"><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <button type="button" className="btn-primary mt-4" onClick={add}>إضافة زر</button>
    </Section>
  );
}

function LookupSection({ table, title }: { table: LookupTable; title: string }) {
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [newName, setNewName] = useState("");

  const reload = useCallback(() => { loadLookup(table).then(setRows); }, [table]);
  useEffect(reload, [reload]);

  async function add() {
    if (!newName.trim()) return;
    await addLookup(table, newName, rows.length + 1);
    setNewName("");
    showToast("تمت الإضافة.");
    reload();
  }

  async function toggle(row: LookupRow) {
    await setLookupActive(table, row.id, !row.active);
    reload();
  }

  async function rename(row: LookupRow) {
    const name = prompt("الاسم الجديد:", row.name);
    if (!name || name.trim() === row.name) return;
    await renameLookup(table, row.id, name);
    showToast("تم التعديل. ملاحظة: السجلات القديمة تحتفظ بالاسم السابق.", "warning");
    reload();
  }

  return (
    <Section title={title} hint="التعطيل يخفي الخيار من نماذج الإدخال بدون المساس بالسجلات القديمة.">
      <div className="overflow-x-auto">
        <table className="app-table">
          <thead>
            <tr><th>الاسم</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="text-center txt-muted py-5">لا توجد عناصر.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="الاسم">{r.name}</td>
                  <td data-label="الحالة" className={r.active ? "txt-cash" : "txt-muted"}>
                    {r.active ? "مفعّل" : "معطّل"}
                  </td>
                  <td className="flex gap-1.5">
                    <button type="button" className="action-button edit-button" onClick={() => rename(r)}>تعديل</button>
                    <button type="button" className="action-button delete-button" onClick={() => toggle(r)}>
                      {r.active ? "تعطيل" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 items-end mt-4">
        <div className="flex-1" style={{ minWidth: 200 }}>
          <Field label="إضافة عنصر جديد">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
        </div>
        <button type="button" className="btn-primary" onClick={add}>إضافة</button>
      </div>
    </Section>
  );
}
