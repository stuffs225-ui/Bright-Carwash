"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";
import {
  AR_GREGORIAN_LOCALE,
  bonusPerWorker,
  formatCurrency,
  getDayBounds,
  getPaymentMethod,
  resolveOccurredAt,
  toDateKey,
  type EntryDayChoice,
} from "@/lib/business";
import { showToast } from "@/lib/toast";
import type { Entry, EntryPreset } from "@/lib/types";
import { enqueue, getQueueByTable } from "@/lib/offlineQueue";
import { isNetworkError } from "@/lib/offlineSync";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/lib/settings";
import { loadPresets, suggestionsFor } from "@/lib/presets";
import { BREAKEVEN_WINDOW_DAYS, computeBreakEven, type BreakEven } from "@/lib/breakeven";
import { getLang, setLang as persistLang, t, type Lang } from "@/lib/i18n";
import { MetricCard } from "./MetricCard";
import { Modal } from "./Modal";
import { PresetGrid } from "./PresetGrid";
import { BreakEvenMeter } from "./BreakEvenMeter";
import { EntryRow } from "./EntryRow";
import { LangSwitch } from "./LangSwitch";

function pendingEntriesFromQueue(): Entry[] {
  return getQueueByTable("entries").map((item) => {
    const p = item.payload as Record<string, string | number | null>;
    const cash = Number(p.cash_paid) || 0;
    const card = Number(p.card_paid) || 0;
    return {
      id: `pending-${item.id}`,
      car_type: String(p.car_type || ""),
      service_type: String(p.service_type || ""),
      cash_paid: cash,
      card_paid: card,
      gross: cash + card,
      payment_method: getPaymentMethod(cash, card),
      notes: (p.notes as string | null) ?? null,
      occurred_at: String(p.occurred_at),
      worker_name: null,
      pending: true,
    };
  });
}

type BulkRow = { carType: string; serviceType: string; cash: string; card: string; notes: string };

function emptyBulkRow(prefill?: Partial<BulkRow>): BulkRow {
  return { carType: "", serviceType: "", cash: "", card: "", notes: "", ...prefill };
}

export function CarEntryTab({ ownerView = true }: { ownerView?: boolean }) {
  const [carTypes, setCarTypes] = useState<string[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [monthEntries, setMonthEntries] = useState<Entry[]>([]);
  const [pendingEntries, setPendingEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showTodayModal, setShowTodayModal] = useState(false);

  const [carType, setCarType] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [cardPaid, setCardPaid] = useState("");
  const [notes, setNotes] = useState("");

  const [presets, setPresets] = useState<EntryPreset[]>([]);
  const [goal, setGoal] = useState<BreakEven | null>(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow()]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // يوم التسجيل — لتصحيح سيارات تُضاف متأخرة (بعد منتصف الليل أو نسيان يوم كامل).
  // يرجع "اليوم" تلقائياً بكل تحميل جديد للصفحة عشان ما يبقى عالقاً على يوم قديم بالغلط.
  const [entryDay, setEntryDay] = useState<EntryDayChoice>("today");
  const [customDate, setCustomDate] = useState("");

  // لغة صفحة تسجيل السيارات فقط — تُحفظ بالجهاز، وباقي النظام يبقى عربي.
  const [lang, setLangState] = useState<Lang>("ar");
  useEffect(() => {
    setLangState(getLang());
  }, []);
  function changeLang(next: Lang) {
    setLangState(next);
    persistLang(next);
  }
  const tt = (text: string, vars?: Record<string, string | number>) => t(lang, text, vars);
  const dateLocale = lang === "en" ? "en-US" : AR_GREGORIAN_LOCALE;

  const loadLists = useCallback(async () => {
    const [{ data: cars }, { data: services }] = await Promise.all([
      supabase.from("car_types").select("name").eq("active", true).order("sort_order"),
      supabase.from("service_types").select("name").eq("active", true).order("sort_order"),
    ]);
    setCarTypes((cars || []).map((c) => c.name));
    setServiceTypes((services || []).map((s) => s.name));
    setPresets(await loadPresets());
  }, []);

  const loadToday = useCallback(async () => {
    const { start, end } = getDayBounds(new Date());
    const { data } = await supabase
      .from("entries")
      .select("*")
      .is("deleted_at", null)
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString())
      .order("occurred_at", { ascending: false });
    setTodayEntries((data as Entry[]) || []);
  }, []);

  const loadMonth = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const data = await fetchAllRows<Entry>((from, to) =>
      supabase
        .from("entries")
        .select("*")
        .is("deleted_at", null)
        .gte("occurred_at", start.toISOString())
        .lt("occurred_at", end.toISOString())
        .order("occurred_at", { ascending: false })
        .range(from, to)
    );
    setMonthEntries(data);
  }, []);

  const loadGoal = useCallback(async (currentSettings: AppSettings) => {
    const since = new Date();
    since.setDate(since.getDate() - BREAKEVEN_WINDOW_DAYS);
    const sinceIso = since.toISOString();

    const [exp, ent] = await Promise.all([
      fetchAllRows<{ amount: number }>((from, to) =>
        supabase.from("expenses").select("amount").is("deleted_at", null).gte("occurred_at", sinceIso).range(from, to)
      ),
      fetchAllRows<{ gross: number }>((from, to) =>
        supabase.from("entries").select("gross").is("deleted_at", null).gte("occurred_at", sinceIso).range(from, to)
      ),
    ]);

    const windowExpenses = exp.reduce((sum, r) => sum + Number(r.amount), 0);
    const windowRevenue = ent.reduce((sum, r) => sum + Number(r.gross), 0);

    setGoal(computeBreakEven({
      windowExpenses,
      windowRevenue,
      windowEntries: ent.length,
      windowDays: BREAKEVEN_WINDOW_DAYS,
      manualDailyTarget: currentSettings.daily_expense_target,
    }));
  }, []);

  const refreshAll = useCallback((currentSettings: AppSettings) => {
    loadToday();
    loadMonth();
    loadGoal(currentSettings);
  }, [loadToday, loadMonth, loadGoal]);

  useEffect(() => {
    loadLists();
    loadSettings().then((s) => {
      setSettings(s);
      settingsRef.current = s;
      refreshAll(s);
    });
    setPendingEntries(pendingEntriesFromQueue());
    const refreshPending = () => setPendingEntries(pendingEntriesFromQueue());
    window.addEventListener("offline-queue-changed", refreshPending);
    const channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => refreshAll(settingsRef.current))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("offline-queue-changed", refreshPending);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayEntriesWithPending = useMemo(() => {
    const { start, end } = getDayBounds(new Date());
    const relevant = pendingEntries.filter((e) => {
      const t = new Date(e.occurred_at);
      return t >= start && t < end;
    });
    return [...relevant, ...todayEntries];
  }, [todayEntries, pendingEntries]);

  const monthEntriesWithPending = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const relevant = pendingEntries.filter((e) => {
      const t = new Date(e.occurred_at);
      return t >= start && t < end;
    });
    return [...relevant, ...monthEntries];
  }, [monthEntries, pendingEntries]);

  const dailyTotals = useMemo(() => {
    const cash = todayEntriesWithPending.reduce((s, e) => s + Number(e.cash_paid), 0);
    const card = todayEntriesWithPending.reduce((s, e) => s + Number(e.card_paid), 0);
    return { count: todayEntriesWithPending.length, cash, card, total: cash + card };
  }, [todayEntriesWithPending]);

  // بعد إلغاء الورديات صار عدّاد الوردية مطابقاً لعدّاد اليوم، فنعتمد واحداً.
  const bonus = useMemo(
    () => bonusPerWorker(dailyTotals.count, settings.shift_car_threshold, settings.worker_bonus_rate),
    [dailyTotals.count, settings.shift_car_threshold, settings.worker_bonus_rate]
  );

  const monthlyByDay = useMemo(() => {
    const map = new Map<string, { cars: number; cash: number; card: number; total: number }>();
    monthEntriesWithPending.forEach((e) => {
      const key = toDateKey(new Date(e.occurred_at));
      const row = map.get(key) || { cars: 0, cash: 0, card: 0, total: 0 };
      row.cars += 1;
      row.cash += Number(e.cash_paid);
      row.card += Number(e.card_paid);
      row.total += Number(e.gross);
      map.set(key, row);
    });
    return Array.from(map.entries())
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [monthEntriesWithPending]);

  function clearForm() {
    setCarType("");
    setServiceType("");
    setCashPaid("");
    setCardPaid("");
    setNotes("");
  }

  // مسار الحفظ الموحّد: يستخدمه النموذج اليدوي والأزرار الجاهزة معاً، فيمر
  // الاثنان بنفس منطق الطابور المحلي عند انقطاع الشبكة.
  async function saveEntry(payload: Record<string, unknown>, successMessage: string): Promise<boolean> {
    const queueLocally = (reason: string) => {
      enqueue("entries", payload);
      showToast(`${tt(reason)}${tt(" — تم الحفظ محلياً وسيُرفع تلقائياً عند رجوع النت.")}`, "warning");
    };

    if (!navigator.onLine) {
      queueLocally("لا يوجد اتصال");
      return true;
    }

    const { error } = await supabase.from("entries").insert(payload);
    if (error) {
      if (isNetworkError(error)) {
        queueLocally("تعذر الاتصال");
        return true;
      }
      showToast(tt("خطأ في الحفظ: ") + error.message, "error");
      return false;
    }

    showToast(successMessage);
    refreshAll(settingsRef.current);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cash = Number(cashPaid) || 0;
    const card = Number(cardPaid) || 0;
    if (!carType || !serviceType) {
      showToast(tt("يرجى اختيار نوع السيارة ونوع الخدمة."), "warning");
      return;
    }
    if (cash + card <= 0) {
      showToast(tt("الرجاء إدخال مبلغ صحيح."), "warning");
      return;
    }
    if (entryDay === "custom" && !customDate) {
      showToast(tt("اختر التاريخ أولاً."), "warning");
      return;
    }
    setSubmitting(true);
    const ok = await saveEntry(
      {
        car_type: carType,
        service_type: serviceType,
        cash_paid: cash,
        card_paid: card,
        notes: notes || null,
        occurred_at: resolveOccurredAt(entryDay, customDate),
      },
      tt("تمت إضافة السيارة بنجاح!")
    );
    setSubmitting(false);
    if (ok) clearForm();
  }

  async function handlePresetPick(preset: EntryPreset, method: "cash" | "card") {
    if (entryDay === "custom" && !customDate) {
      showToast(tt("اختر التاريخ أولاً."), "warning");
      return;
    }
    setSubmitting(true);
    await saveEntry(
      {
        car_type: preset.car_type,
        service_type: preset.service_type,
        cash_paid: method === "cash" ? preset.amount : 0,
        card_paid: method === "card" ? preset.amount : 0,
        notes: null,
        occurred_at: resolveOccurredAt(entryDay, customDate),
      },
      `${tt("تم تسجيل")} ${preset.car_type} · ${formatCurrency(preset.amount)}`
    );
    setSubmitting(false);
  }

  function updateBulkRow(index: number, patch: Partial<BulkRow>) {
    setBulkRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addBulkRow() {
    setBulkRows((rows) => {
      const last = rows[rows.length - 1];
      return [...rows, emptyBulkRow({ carType: last?.carType, serviceType: last?.serviceType })];
    });
  }

  function removeBulkRow(index: number) {
    setBulkRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (entryDay === "custom" && !customDate) {
      showToast("اختر التاريخ أولاً.", "warning");
      return;
    }
    const occurredAt = resolveOccurredAt(entryDay, customDate);
    const payloads = bulkRows.map((row) => ({
      car_type: row.carType,
      service_type: row.serviceType,
      cash_paid: Number(row.cash) || 0,
      card_paid: Number(row.card) || 0,
      notes: row.notes || null,
      occurred_at: occurredAt,
    }));

    const invalid = payloads.find((p) => !p.car_type || !p.service_type || p.cash_paid + p.card_paid <= 0);
    if (invalid) {
      showToast(tt("تأكد إن كل سطر فيه نوع سيارة، نوع خدمة، ومبلغ أكبر من صفر."), "warning");
      return;
    }

    setBulkSubmitting(true);

    if (!navigator.onLine) {
      payloads.forEach((p) => enqueue("entries", p));
      setBulkSubmitting(false);
      showToast(tt("لا يوجد اتصال — تم حفظ {n} سيارة محلياً وستُرفع تلقائياً عند رجوع النت.", { n: payloads.length }), "warning");
      setBulkRows([emptyBulkRow()]);
      return;
    }

    const { error } = await supabase.from("entries").insert(payloads);
    setBulkSubmitting(false);
    if (error) {
      if (isNetworkError(error)) {
        payloads.forEach((p) => enqueue("entries", p));
        showToast(tt("تعذر الاتصال — تم حفظ {n} سيارة محلياً وستُرفع تلقائياً عند رجوع النت.", { n: payloads.length }), "warning");
        setBulkRows([emptyBulkRow()]);
        return;
      }
      showToast(tt("خطأ في حفظ السيارات: ") + error.message, "error");
      return;
    }

    showToast(tt("تمت إضافة {n} سيارة بنجاح!", { n: payloads.length }));
    setBulkRows([emptyBulkRow()]);
    refreshAll(settingsRef.current);
  }

  async function handleDelete(id: string) {
    if (!confirm(tt("هل أنت متأكد من حذف هذا السجل؟"))) return;
    const { error } = await supabase.from("entries").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      showToast(tt("فشل الحذف: ") + error.message, "error");
      return;
    }
    showToast(tt("تم حذف السجل بنجاح!"));
    refreshAll(settingsRef.current);
  }

  async function handleUpdate(entry: Entry, patch: Partial<Entry>) {
    const cash = Number(patch.cash_paid ?? entry.cash_paid);
    const card = Number(patch.card_paid ?? entry.card_paid);
    if (cash + card <= 0) {
      showToast(tt("يجب أن يكون إجمالي المبلغ أكبر من صفر."), "warning");
      return;
    }
    const { error } = await supabase
      .from("entries")
      .update({
        car_type: patch.car_type ?? entry.car_type,
        service_type: patch.service_type ?? entry.service_type,
        cash_paid: cash,
        card_paid: card,
        notes: patch.notes ?? entry.notes,
        occurred_at: patch.occurred_at ?? entry.occurred_at,
      })
      .eq("id", entry.id);
    if (error) {
      showToast(tt("فشل التحديث: ") + error.message, "error");
      return;
    }
    showToast(tt("تم تحديث السجل بنجاح!"));
    setEditingId(null);
    refreshAll(settingsRef.current);
  }

  const dayEntries = selectedDay ? monthEntriesWithPending.filter((e) => toDateKey(new Date(e.occurred_at)) === selectedDay) : [];

  const priceSuggestions = suggestionsFor(presets, carType, serviceType);

  const resolvedEntryDateLabel = useMemo(() => {
    const iso = resolveOccurredAt(entryDay, customDate);
    return new Date(iso).toLocaleDateString(dateLocale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }, [entryDay, customDate, dateLocale]);

  return (
    <div className="space-y-6" dir={lang === "en" ? "ltr" : "rtl"}>
      <div className="flex justify-end">
        <LangSwitch lang={lang} onChange={changeLang} />
      </div>

      {goal && (
        <BreakEvenMeter
          goal={goal}
          carsToday={dailyTotals.count}
          revenueToday={dailyTotals.total}
          ownerView={ownerView}
          lang={lang}
        />
      )}

      <section className="card">
        <span className="form-label">{tt("تاريخ التسجيل")}</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={entryDay === "today" ? "btn-primary" : "btn-secondary"} onClick={() => setEntryDay("today")}>{tt("اليوم")}</button>
          <button type="button" className={entryDay === "yesterday" ? "btn-primary" : "btn-secondary"} onClick={() => setEntryDay("yesterday")}>{tt("أمس")}</button>
          <button type="button" className={entryDay === "custom" ? "btn-primary" : "btn-secondary"} onClick={() => setEntryDay("custom")}>{tt("تاريخ آخر")}</button>
        </div>
        {entryDay === "custom" && (
          <div className="mt-3" style={{ maxWidth: 220 }}>
            <input type="date" value={customDate} max={toDateKey(new Date())} onChange={(e) => setCustomDate(e.target.value)} />
          </div>
        )}
        {entryDay !== "today" && (
          <p className="txt-warning font-bold text-sm mt-3">
            {tt("⚠️ السيارات المُضافة الآن ستُسجَّل ليوم {date}", { date: resolvedEntryDateLabel })}
          </p>
        )}
      </section>

      {!bulkMode && presets.length > 0 && (
        <section className="card">
          <h2 className="section-title">{tt("تسجيل سريع")}</h2>
          <PresetGrid presets={presets} disabled={submitting} onPick={handlePresetPick} lang={lang} />
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="section-title mb-0">{bulkMode ? tt("إضافة عدة سيارات دفعة وحدة") : tt("إدخال سيارة جديدة")}</h2>
          <button type="button" className="btn-secondary" onClick={() => setBulkMode((v) => !v)}>
            {bulkMode ? tt("رجوع لإدخال سيارة واحدة") : tt("➕ إضافة عدة سيارات")}
          </button>
        </div>

        {!bulkMode ? (
          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">{tt("نوع السيارة")}</label>
                <div className="select-wrapper">
                  <select value={carType} onChange={(e) => setCarType(e.target.value)} required>
                    <option value="">{tt("اختر...")}</option>
                    {carTypes.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">{tt("نوع الخدمة")}</label>
                <div className="select-wrapper">
                  <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} required>
                    <option value="">{tt("اختر...")}</option>
                    {serviceTypes.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {priceSuggestions.length > 0 && (
              <div>
                <label className="form-label">{tt("الأسعار المعتادة لهذي التركيبة")}</label>
                <div className="suggestion-row">
                  {priceSuggestions.map((p) => (
                    <span key={p.id} className="contents">
                      <button
                        type="button"
                        className="suggestion-chip"
                        onClick={() => { setCashPaid(String(p.amount)); setCardPaid(""); }}
                      >
                        {formatCurrency(p.amount)} {tt("كاش")}
                      </button>
                      <button
                        type="button"
                        className="suggestion-chip"
                        onClick={() => { setCardPaid(String(p.amount)); setCashPaid(""); }}
                      >
                        {formatCurrency(p.amount)} {tt("بطاقة")}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">{tt("كاش")}</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{tt("بطاقة")}</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={cardPaid} onChange={(e) => setCardPaid(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">{tt("ملاحظات")}</label>
              <input type="text" placeholder={tt("أي تفاصيل إضافية...")} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button type="submit" disabled={submitting} className="btn-add-car w-full">
              {submitting ? <span className="spinner" /> : tt("إضافة السيارة")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="space-y-4 mt-4">
            <div className="space-y-3">
              {bulkRows.map((row, index) => (
                <div key={index} className="bulk-row">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                    <div>
                      <label className="form-label">{tt("نوع السيارة")}</label>
                      <select value={row.carType} onChange={(e) => updateBulkRow(index, { carType: e.target.value })} required>
                        <option value="">{tt("اختر...")}</option>
                        {carTypes.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">{tt("نوع الخدمة")}</label>
                      <select value={row.serviceType} onChange={(e) => updateBulkRow(index, { serviceType: e.target.value })} required>
                        <option value="">{tt("اختر...")}</option>
                        {serviceTypes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">{tt("كاش")}</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={row.cash} onChange={(e) => updateBulkRow(index, { cash: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">{tt("بطاقة")}</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={row.card} onChange={(e) => updateBulkRow(index, { card: e.target.value })} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="form-label">{tt("ملاحظات")}</label>
                        <input type="text" value={row.notes} onChange={(e) => updateBulkRow(index, { notes: e.target.value })} />
                      </div>
                      <button
                        type="button"
                        className="action-button delete-button"
                        onClick={() => removeBulkRow(index)}
                        disabled={bulkRows.length <= 1}
                        title={tt("حذف السطر")}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={addBulkRow}>{tt("+ إضافة سطر")}</button>
            </div>
            <button type="submit" disabled={bulkSubmitting} className="btn-add-car w-full">
              {bulkSubmitting ? <span className="spinner" /> : tt("حفظ الكل ({n})", { n: bulkRows.length })}
            </button>
          </form>
        )}
      </section>

      <section className="card text-center">
        <button type="button" className="section-title text-center w-full underline decoration-dotted" onClick={() => setShowTodayModal(true)}>
          {tt("اليوم - ")}{new Date().toLocaleDateString(dateLocale, { weekday: "long" })} ({new Date().toLocaleDateString("en-GB")})
        </button>
        {ownerView ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label={tt("السيارات")} value={dailyTotals.count} tone="blue" />
            <MetricCard label={tt("كاش")} value={formatCurrency(dailyTotals.cash)} tone="green" />
            <MetricCard label={tt("بطاقة")} value={formatCurrency(dailyTotals.card)} tone="purple" />
            <MetricCard label={tt("الإجمالي")} value={formatCurrency(dailyTotals.total)} tone="slate" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <MetricCard label={tt("سيارات اليوم")} value={dailyTotals.count} tone="blue" />
          </div>
        )}
        <hr className="my-5 rule" />
        <h3 className="subsection-title text-center">{tt("مكافأة اليوم")}</h3>
        <div className="grid grid-cols-1 gap-4">
          <MetricCard label={tt("مكافأة كل عامل")} value={formatCurrency(bonus)} tone="emerald" />
        </div>
      </section>

      <section className="card overflow-hidden p-0" hidden={!ownerView}>
        <button type="button" className={`accordion-button ${showMonthly ? "active" : ""}`} onClick={() => setShowMonthly((v) => !v)}>
          <span>{tt("الدخل الشهري")}</span>
          <span>⌄</span>
        </button>
        <div className="accordion-content" style={{ maxHeight: showMonthly ? "5000px" : undefined }}>
          <div className="p-4 overflow-x-auto">
            {monthlyByDay.length === 0 ? (
              <p className="py-5 txt-muted text-center">{tt("لا توجد بيانات دخل لهذا الشهر.")}</p>
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>{tt("اليوم")}</th><th>{tt("عدد السيارات")}</th><th>{tt("كاش")}</th><th>{tt("بطاقة")}</th><th>{tt("الإجمالي")}</th></tr>
                </thead>
                <tbody>
                  {monthlyByDay.map((row) => {
                    const day = new Date(`${row.date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long" });
                    return (
                      <tr key={row.date}>
                        <td data-label={tt("اليوم")}>
                          <button type="button" className="link-inline" onClick={() => setSelectedDay(row.date)}>
                            {day} - {row.date}
                          </button>
                        </td>
                        <td data-label={tt("عدد السيارات")}>{row.cars}</td>
                        <td data-label={tt("كاش")} className="txt-cash">{formatCurrency(row.cash)}</td>
                        <td data-label={tt("بطاقة")} className="txt-card">{formatCurrency(row.card)}</td>
                        <td data-label={tt("الإجمالي")} className="font-extrabold">{formatCurrency(row.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {selectedDay && (
        <Modal title={tt("إدخالات {day}", { day: selectedDay })} onClose={() => setSelectedDay(null)}>
          <div className="overflow-x-auto" dir={lang === "en" ? "ltr" : "rtl"}>
            <table className="app-table">
              <thead>
                <tr><th>{tt("الوقت")}</th><th>{tt("السيارة")}</th><th>{tt("الخدمة")}</th><th>{tt("الدفع")}</th><th>{tt("كاش")}</th><th>{tt("بطاقة")}</th><th>{tt("الإجمالي")}</th><th>{tt("إجراءات")}</th></tr>
              </thead>
              <tbody>
                {dayEntries.length === 0 ? (
                  <tr><td colSpan={8} className="text-center txt-muted py-5">{tt("لا توجد إدخالات بهذا اليوم.")}</td></tr>
                ) : (
                  dayEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      carTypes={carTypes}
                      serviceTypes={serviceTypes}
                      editing={editingId === entry.id}
                      onEdit={() => setEditingId(entry.id)}
                      onCancel={() => setEditingId(null)}
                      onSave={(patch) => handleUpdate(entry, patch)}
                      onDelete={() => handleDelete(entry.id)}
                      lang={lang}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {showTodayModal && (
        <Modal title={tt("إدخالات اليوم - {weekday}", { weekday: new Date().toLocaleDateString(dateLocale, { weekday: "long" }) })} onClose={() => setShowTodayModal(false)}>
          <div className="overflow-x-auto" dir={lang === "en" ? "ltr" : "rtl"}>
            <table className="app-table">
              <thead>
                <tr><th>{tt("الوقت")}</th><th>{tt("السيارة")}</th><th>{tt("الخدمة")}</th><th>{tt("الدفع")}</th><th>{tt("كاش")}</th><th>{tt("بطاقة")}</th><th>{tt("الإجمالي")}</th><th>{tt("إجراءات")}</th></tr>
              </thead>
              <tbody>
                {todayEntriesWithPending.length === 0 ? (
                  <tr><td colSpan={8} className="text-center txt-muted py-5">{tt("لا توجد إدخالات لليوم.")}</td></tr>
                ) : (
                  todayEntriesWithPending.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      carTypes={carTypes}
                      serviceTypes={serviceTypes}
                      editing={editingId === entry.id}
                      onEdit={() => setEditingId(entry.id)}
                      onCancel={() => setEditingId(null)}
                      onSave={(patch) => handleUpdate(entry, patch)}
                      onDelete={() => handleDelete(entry.id)}
                      lang={lang}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
