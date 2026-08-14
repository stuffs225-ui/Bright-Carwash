"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";
import { AR_GREGORIAN_LOCALE, bonusPerWorker, formatCurrency, getDayBounds, getPaymentMethod, toDateKey } from "@/lib/business";
import { showToast } from "@/lib/toast";
import type { Entry, EntryPreset } from "@/lib/types";
import { enqueue, getQueueByTable } from "@/lib/offlineQueue";
import { isNetworkError } from "@/lib/offlineSync";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/lib/settings";
import { loadPresets, suggestionsFor } from "@/lib/presets";
import { BREAKEVEN_WINDOW_DAYS, computeBreakEven, type BreakEven } from "@/lib/breakeven";
import { MetricCard } from "./MetricCard";
import { Modal } from "./Modal";
import { PresetGrid } from "./PresetGrid";
import { BreakEvenMeter } from "./BreakEvenMeter";
import { EntryRow } from "./EntryRow";

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
      showToast(`${reason} — تم الحفظ محلياً وسيُرفع تلقائياً عند رجوع النت.`, "warning");
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
      showToast("خطأ في الحفظ: " + error.message, "error");
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
      showToast("يرجى اختيار نوع السيارة ونوع الخدمة.", "warning");
      return;
    }
    if (cash + card <= 0) {
      showToast("الرجاء إدخال مبلغ صحيح.", "warning");
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
        occurred_at: new Date().toISOString(),
      },
      "تمت إضافة السيارة بنجاح!"
    );
    setSubmitting(false);
    if (ok) clearForm();
  }

  async function handlePresetPick(preset: EntryPreset, method: "cash" | "card") {
    setSubmitting(true);
    await saveEntry(
      {
        car_type: preset.car_type,
        service_type: preset.service_type,
        cash_paid: method === "cash" ? preset.amount : 0,
        card_paid: method === "card" ? preset.amount : 0,
        notes: null,
        occurred_at: new Date().toISOString(),
      },
      `تم تسجيل ${preset.car_type} · ${formatCurrency(preset.amount)}`
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
    const now = new Date().toISOString();
    const payloads = bulkRows.map((row) => ({
      car_type: row.carType,
      service_type: row.serviceType,
      cash_paid: Number(row.cash) || 0,
      card_paid: Number(row.card) || 0,
      notes: row.notes || null,
      occurred_at: now,
    }));

    const invalid = payloads.find((p) => !p.car_type || !p.service_type || p.cash_paid + p.card_paid <= 0);
    if (invalid) {
      showToast("تأكد إن كل سطر فيه نوع سيارة، نوع خدمة، ومبلغ أكبر من صفر.", "warning");
      return;
    }

    setBulkSubmitting(true);

    if (!navigator.onLine) {
      payloads.forEach((p) => enqueue("entries", p));
      setBulkSubmitting(false);
      showToast(`لا يوجد اتصال — تم حفظ ${payloads.length} سيارة محلياً وستُرفع تلقائياً عند رجوع النت.`, "warning");
      setBulkRows([emptyBulkRow()]);
      return;
    }

    const { error } = await supabase.from("entries").insert(payloads);
    setBulkSubmitting(false);
    if (error) {
      if (isNetworkError(error)) {
        payloads.forEach((p) => enqueue("entries", p));
        showToast(`تعذر الاتصال — تم حفظ ${payloads.length} سيارة محلياً وستُرفع تلقائياً عند رجوع النت.`, "warning");
        setBulkRows([emptyBulkRow()]);
        return;
      }
      showToast("خطأ في حفظ السيارات: " + error.message, "error");
      return;
    }

    showToast(`تمت إضافة ${payloads.length} سيارة بنجاح!`);
    setBulkRows([emptyBulkRow()]);
    refreshAll(settingsRef.current);
  }

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
    const { error } = await supabase.from("entries").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      showToast("فشل الحذف: " + error.message, "error");
      return;
    }
    showToast("تم حذف السجل بنجاح!");
    refreshAll(settingsRef.current);
  }

  async function handleUpdate(entry: Entry, patch: Partial<Entry>) {
    const cash = Number(patch.cash_paid ?? entry.cash_paid);
    const card = Number(patch.card_paid ?? entry.card_paid);
    if (cash + card <= 0) {
      showToast("يجب أن يكون إجمالي المبلغ أكبر من صفر.", "warning");
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
      })
      .eq("id", entry.id);
    if (error) {
      showToast("فشل التحديث: " + error.message, "error");
      return;
    }
    showToast("تم تحديث السجل بنجاح!");
    setEditingId(null);
    refreshAll(settingsRef.current);
  }

  const dayEntries = selectedDay ? monthEntriesWithPending.filter((e) => toDateKey(new Date(e.occurred_at)) === selectedDay) : [];

  const priceSuggestions = suggestionsFor(presets, carType, serviceType);

  return (
    <div className="space-y-6">
      {goal && (
        <BreakEvenMeter
          goal={goal}
          carsToday={dailyTotals.count}
          revenueToday={dailyTotals.total}
          ownerView={ownerView}
        />
      )}

      {!bulkMode && presets.length > 0 && (
        <section className="card">
          <h2 className="section-title">تسجيل سريع</h2>
          <PresetGrid presets={presets} disabled={submitting} onPick={handlePresetPick} />
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="section-title mb-0">{bulkMode ? "إضافة عدة سيارات دفعة وحدة" : "إدخال سيارة جديدة"}</h2>
          <button type="button" className="btn-secondary" onClick={() => setBulkMode((v) => !v)}>
            {bulkMode ? "رجوع لإدخال سيارة واحدة" : "➕ إضافة عدة سيارات"}
          </button>
        </div>

        {!bulkMode ? (
          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">نوع السيارة</label>
                <div className="select-wrapper">
                  <select value={carType} onChange={(e) => setCarType(e.target.value)} required>
                    <option value="">اختر...</option>
                    {carTypes.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">نوع الخدمة</label>
                <div className="select-wrapper">
                  <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} required>
                    <option value="">اختر...</option>
                    {serviceTypes.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {priceSuggestions.length > 0 && (
              <div>
                <label className="form-label">الأسعار المعتادة لهذي التركيبة</label>
                <div className="suggestion-row">
                  {priceSuggestions.map((p) => (
                    <span key={p.id} className="contents">
                      <button
                        type="button"
                        className="suggestion-chip"
                        onClick={() => { setCashPaid(String(p.amount)); setCardPaid(""); }}
                      >
                        {formatCurrency(p.amount)} كاش
                      </button>
                      <button
                        type="button"
                        className="suggestion-chip"
                        onClick={() => { setCardPaid(String(p.amount)); setCashPaid(""); }}
                      >
                        {formatCurrency(p.amount)} بطاقة
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">كاش</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} />
              </div>
              <div>
                <label className="form-label">بطاقة</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={cardPaid} onChange={(e) => setCardPaid(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">ملاحظات</label>
              <input type="text" placeholder="أي تفاصيل إضافية..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button type="submit" disabled={submitting} className="btn-add-car w-full">
              {submitting ? <span className="spinner" /> : "إضافة السيارة"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="space-y-4 mt-4">
            <div className="space-y-3">
              {bulkRows.map((row, index) => (
                <div key={index} className="bulk-row">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                    <div>
                      <label className="form-label">نوع السيارة</label>
                      <select value={row.carType} onChange={(e) => updateBulkRow(index, { carType: e.target.value })} required>
                        <option value="">اختر...</option>
                        {carTypes.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">نوع الخدمة</label>
                      <select value={row.serviceType} onChange={(e) => updateBulkRow(index, { serviceType: e.target.value })} required>
                        <option value="">اختر...</option>
                        {serviceTypes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">كاش</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={row.cash} onChange={(e) => updateBulkRow(index, { cash: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">بطاقة</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={row.card} onChange={(e) => updateBulkRow(index, { card: e.target.value })} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="form-label">ملاحظات</label>
                        <input type="text" value={row.notes} onChange={(e) => updateBulkRow(index, { notes: e.target.value })} />
                      </div>
                      <button
                        type="button"
                        className="action-button delete-button"
                        onClick={() => removeBulkRow(index)}
                        disabled={bulkRows.length <= 1}
                        title="حذف السطر"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={addBulkRow}>+ إضافة سطر</button>
            </div>
            <button type="submit" disabled={bulkSubmitting} className="btn-add-car w-full">
              {bulkSubmitting ? <span className="spinner" /> : `حفظ الكل (${bulkRows.length})`}
            </button>
          </form>
        )}
      </section>

      <section className="card text-center">
        <button type="button" className="section-title text-center w-full underline decoration-dotted" onClick={() => setShowTodayModal(true)}>
          اليوم - {new Date().toLocaleDateString(AR_GREGORIAN_LOCALE, { weekday: "long" })} ({new Date().toLocaleDateString("en-GB")})
        </button>
        {ownerView ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="السيارات" value={dailyTotals.count} tone="blue" />
            <MetricCard label="كاش" value={formatCurrency(dailyTotals.cash)} tone="green" />
            <MetricCard label="بطاقة" value={formatCurrency(dailyTotals.card)} tone="purple" />
            <MetricCard label="الإجمالي" value={formatCurrency(dailyTotals.total)} tone="slate" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <MetricCard label="سيارات اليوم" value={dailyTotals.count} tone="blue" />
          </div>
        )}
        <hr className="my-5 rule" />
        <h3 className="subsection-title text-center">مكافأة اليوم</h3>
        <div className="grid grid-cols-1 gap-4">
          <MetricCard label="مكافأة كل عامل" value={formatCurrency(bonus)} tone="emerald" />
        </div>
      </section>

      <section className="card overflow-hidden p-0" hidden={!ownerView}>
        <button type="button" className={`accordion-button ${showMonthly ? "active" : ""}`} onClick={() => setShowMonthly((v) => !v)}>
          <span>الدخل الشهري</span>
          <span>⌄</span>
        </button>
        <div className="accordion-content" style={{ maxHeight: showMonthly ? "5000px" : undefined }}>
          <div className="p-4 overflow-x-auto">
            {monthlyByDay.length === 0 ? (
              <p className="py-5 txt-muted text-center">لا توجد بيانات دخل لهذا الشهر.</p>
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>اليوم</th><th>عدد السيارات</th><th>كاش</th><th>بطاقة</th><th>الإجمالي</th></tr>
                </thead>
                <tbody>
                  {monthlyByDay.map((row) => {
                    const day = new Date(`${row.date}T12:00:00`).toLocaleDateString(AR_GREGORIAN_LOCALE, { weekday: "long" });
                    return (
                      <tr key={row.date}>
                        <td data-label="اليوم">
                          <button type="button" className="link-inline" onClick={() => setSelectedDay(row.date)}>
                            {day} - {row.date}
                          </button>
                        </td>
                        <td data-label="عدد السيارات">{row.cars}</td>
                        <td data-label="كاش" className="txt-cash">{formatCurrency(row.cash)}</td>
                        <td data-label="بطاقة" className="txt-card">{formatCurrency(row.card)}</td>
                        <td data-label="الإجمالي" className="font-extrabold">{formatCurrency(row.total)}</td>
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
        <Modal title={`إدخالات ${selectedDay}`} onClose={() => setSelectedDay(null)}>
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead>
                <tr><th>الوقت</th><th>السيارة</th><th>الخدمة</th><th>الدفع</th><th>كاش</th><th>بطاقة</th><th>الإجمالي</th><th>إجراءات</th></tr>
              </thead>
              <tbody>
                {dayEntries.length === 0 ? (
                  <tr><td colSpan={8} className="text-center txt-muted py-5">لا توجد إدخالات بهذا اليوم.</td></tr>
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
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {showTodayModal && (
        <Modal title={`إدخالات اليوم - ${new Date().toLocaleDateString(AR_GREGORIAN_LOCALE, { weekday: "long" })}`} onClose={() => setShowTodayModal(false)}>
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead>
                <tr><th>الوقت</th><th>السيارة</th><th>الخدمة</th><th>الدفع</th><th>كاش</th><th>بطاقة</th><th>الإجمالي</th><th>إجراءات</th></tr>
              </thead>
              <tbody>
                {todayEntriesWithPending.length === 0 ? (
                  <tr><td colSpan={8} className="text-center txt-muted py-5">لا توجد إدخالات لليوم.</td></tr>
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
