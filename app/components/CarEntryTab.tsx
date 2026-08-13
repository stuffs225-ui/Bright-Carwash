"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { bonusPerWorker, formatCurrency, getCurrentShiftWindow, getPaymentMethod, toDateKey } from "@/lib/business";
import { showToast } from "@/lib/toast";
import type { Entry } from "@/lib/types";
import { enqueue, getQueueByTable } from "@/lib/offlineQueue";
import { isNetworkError } from "@/lib/offlineSync";
import { MetricCard } from "./MetricCard";

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

function dayBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function CarEntryTab() {
  const [carTypes, setCarTypes] = useState<string[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [shiftCount, setShiftCount] = useState(0);
  const [monthEntries, setMonthEntries] = useState<Entry[]>([]);
  const [pendingEntries, setPendingEntries] = useState<Entry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [carType, setCarType] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [cardPaid, setCardPaid] = useState("");
  const [notes, setNotes] = useState("");

  const loadLists = useCallback(async () => {
    const [{ data: cars }, { data: services }] = await Promise.all([
      supabase.from("car_types").select("name").eq("active", true).order("sort_order"),
      supabase.from("service_types").select("name").eq("active", true).order("sort_order"),
    ]);
    setCarTypes((cars || []).map((c) => c.name));
    setServiceTypes((services || []).map((s) => s.name));
  }, []);

  const loadToday = useCallback(async () => {
    const { start, end } = dayBounds(new Date());
    const { data } = await supabase
      .from("entries")
      .select("*")
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString())
      .order("occurred_at", { ascending: false });
    setTodayEntries((data as Entry[]) || []);
  }, []);

  const loadShift = useCallback(async () => {
    const { start, end } = getCurrentShiftWindow(new Date());
    const { count } = await supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString());
    setShiftCount(count || 0);
  }, []);

  const loadMonth = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const { data } = await supabase
      .from("entries")
      .select("*")
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString())
      .order("occurred_at", { ascending: false });
    setMonthEntries((data as Entry[]) || []);
  }, []);

  const refreshAll = useCallback(() => {
    loadToday();
    loadShift();
    loadMonth();
  }, [loadToday, loadShift, loadMonth]);

  useEffect(() => {
    loadLists();
    refreshAll();
    setPendingEntries(pendingEntriesFromQueue());
    const refreshPending = () => setPendingEntries(pendingEntriesFromQueue());
    window.addEventListener("offline-queue-changed", refreshPending);
    const channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => refreshAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("offline-queue-changed", refreshPending);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayEntriesWithPending = useMemo(() => {
    const { start, end } = dayBounds(new Date());
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

  const shiftCountWithPending = useMemo(() => {
    const { start, end } = getCurrentShiftWindow(new Date());
    const extra = pendingEntries.filter((e) => {
      const t = new Date(e.occurred_at);
      return t >= start && t < end;
    }).length;
    return shiftCount + extra;
  }, [shiftCount, pendingEntries]);

  const bonus = useMemo(() => bonusPerWorker(shiftCountWithPending), [shiftCountWithPending]);

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
  }, [monthEntries]);

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
    const payload = {
      car_type: carType,
      service_type: serviceType,
      cash_paid: cash,
      card_paid: card,
      notes: notes || null,
      occurred_at: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      enqueue("entries", payload);
      setSubmitting(false);
      showToast("لا يوجد اتصال — تم حفظ السيارة محلياً وستُرفع تلقائياً عند رجوع النت.", "warning");
      setCarType(""); setServiceType(""); setCashPaid(""); setCardPaid(""); setNotes("");
      return;
    }

    const { error } = await supabase.from("entries").insert(payload);
    setSubmitting(false);
    if (error) {
      if (isNetworkError(error)) {
        enqueue("entries", payload);
        showToast("تعذر الاتصال — تم حفظ السيارة محلياً وستُرفع تلقائياً عند رجوع النت.", "warning");
        setCarType(""); setServiceType(""); setCashPaid(""); setCardPaid(""); setNotes("");
        return;
      }
      showToast("خطأ في حفظ السيارة: " + error.message, "error");
      return;
    }
    showToast("تمت إضافة السيارة بنجاح!");
    setCarType("");
    setServiceType("");
    setCashPaid("");
    setCardPaid("");
    setNotes("");
    refreshAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) {
      showToast("فشل الحذف: " + error.message, "error");
      return;
    }
    showToast("تم حذف السجل بنجاح!");
    refreshAll();
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
    refreshAll();
  }

  const dayEntries = selectedDay ? monthEntriesWithPending.filter((e) => toDateKey(new Date(e.occurred_at)) === selectedDay) : [];

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="section-title">إدخال سيارة جديدة</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
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
      </section>

      <section className="card text-center">
        <h2 className="section-title text-center">
          اليوم - {new Date().toLocaleDateString("ar-SA", { weekday: "long" })} ({new Date().toLocaleDateString("en-GB")})
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="السيارات" value={dailyTotals.count} bg="bg-blue-50" color="text-blue-700" />
          <MetricCard label="كاش" value={formatCurrency(dailyTotals.cash)} bg="bg-green-50" color="text-green-700" />
          <MetricCard label="بطاقة" value={formatCurrency(dailyTotals.card)} bg="bg-purple-50" color="text-purple-700" />
          <MetricCard label="الإجمالي" value={formatCurrency(dailyTotals.total)} bg="bg-slate-50" color="text-slate-800" />
        </div>
        <hr className="my-5 border-gray-200" />
        <h3 className="subsection-title text-center">الوردية الحالية</h3>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="سيارات الوردية" value={shiftCountWithPending} bg="bg-cyan-50" color="text-cyan-700" />
          <MetricCard label="مكافأة كل عامل" value={formatCurrency(bonus)} bg="bg-emerald-50" color="text-emerald-700" />
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <button type="button" className={`accordion-button ${showToday ? "active" : ""}`} onClick={() => setShowToday((v) => !v)}>
          <span>تفاصيل إدخالات اليوم</span>
          <span>⌄</span>
        </button>
        <div className="accordion-content" style={{ maxHeight: showToday ? "3000px" : undefined }}>
          <div className="p-4 overflow-x-auto">
            {todayEntriesWithPending.length === 0 ? (
              <p className="py-5 text-gray-500 text-center">لا توجد إدخالات لليوم.</p>
            ) : (
              <table className="app-table">
                <thead>
                  <tr>
                    <th>الوقت</th><th>السيارة</th><th>الخدمة</th><th>الدفع</th><th>كاش</th><th>بطاقة</th><th>الإجمالي</th><th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {todayEntriesWithPending.map((entry) => (
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
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <button type="button" className={`accordion-button ${showMonthly ? "active" : ""}`} onClick={() => setShowMonthly((v) => !v)}>
          <span>الدخل الشهري</span>
          <span>⌄</span>
        </button>
        <div className="accordion-content" style={{ maxHeight: showMonthly ? "5000px" : undefined }}>
          <div className="p-4 overflow-x-auto">
            {monthlyByDay.length === 0 ? (
              <p className="py-5 text-gray-500 text-center">لا توجد بيانات دخل لهذا الشهر.</p>
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>اليوم</th><th>عدد السيارات</th><th>كاش</th><th>بطاقة</th><th>الإجمالي</th></tr>
                </thead>
                <tbody>
                  {monthlyByDay.map((row) => {
                    const day = new Date(`${row.date}T12:00:00`).toLocaleDateString("ar-SA", { weekday: "long" });
                    return (
                      <tr key={row.date}>
                        <td>
                          <button type="button" className="text-blue-700 font-bold underline" onClick={() => setSelectedDay(selectedDay === row.date ? null : row.date)}>
                            {day} - {row.date}
                          </button>
                        </td>
                        <td>{row.cars}</td>
                        <td className="text-green-700 font-bold">{formatCurrency(row.cash)}</td>
                        <td className="text-purple-700 font-bold">{formatCurrency(row.card)}</td>
                        <td className="font-extrabold">{formatCurrency(row.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {selectedDay && (
              <div className="mt-5 border-t pt-4">
                <h4 className="subsection-title">إدخالات {selectedDay}</h4>
                <table className="app-table">
                  <thead>
                    <tr><th>الوقت</th><th>السيارة</th><th>الخدمة</th><th>الدفع</th><th>كاش</th><th>بطاقة</th><th>الإجمالي</th><th>إجراءات</th></tr>
                  </thead>
                  <tbody>
                    {dayEntries.map((entry) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function EntryRow({
  entry,
  carTypes,
  serviceTypes,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  entry: Entry;
  carTypes: string[];
  serviceTypes: string[];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<Entry>) => void;
  onDelete: () => void;
}) {
  const [carType, setCarType] = useState(entry.car_type);
  const [serviceType, setServiceType] = useState(entry.service_type);
  const [cash, setCash] = useState(String(entry.cash_paid));
  const [card, setCard] = useState(String(entry.card_paid));
  const [notes, setNotes] = useState(entry.notes || "");

  const time = new Date(entry.occurred_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  if (entry.pending) {
    return (
      <tr style={{ opacity: 0.65 }}>
        <td>{time}</td>
        <td>{entry.car_type}</td>
        <td>{entry.service_type}</td>
        <td>{entry.payment_method}</td>
        <td className="text-green-700 font-bold">{formatCurrency(entry.cash_paid)}</td>
        <td className="text-purple-700 font-bold">{formatCurrency(entry.card_paid)}</td>
        <td className="font-extrabold">{formatCurrency(entry.gross)}</td>
        <td className="text-amber-600 font-bold text-sm">⏳ بانتظار الرفع</td>
      </tr>
    );
  }

  if (!editing) {
    return (
      <tr>
        <td>{time}</td>
        <td>{entry.car_type}</td>
        <td>{entry.service_type}</td>
        <td>{entry.payment_method}</td>
        <td className="text-green-700 font-bold">{formatCurrency(entry.cash_paid)}</td>
        <td className="text-purple-700 font-bold">{formatCurrency(entry.card_paid)}</td>
        <td className="font-extrabold">{formatCurrency(entry.gross)}</td>
        <td className="flex gap-1.5">
          <button type="button" className="action-button edit-button" onClick={onEdit}>تعديل</button>
          <button type="button" className="action-button delete-button" onClick={onDelete}>حذف</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={8}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 py-2">
          <div>
            <label className="form-label">نوع السيارة</label>
            <select value={carType} onChange={(e) => setCarType(e.target.value)}>
              {carTypes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">نوع الخدمة</label>
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              {serviceTypes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">كاش</label>
            <input type="number" step="0.01" min="0" value={cash} onChange={(e) => setCash(e.target.value)} />
          </div>
          <div>
            <label className="form-label">بطاقة</label>
            <input type="number" step="0.01" min="0" value={card} onChange={(e) => setCard(e.target.value)} />
          </div>
          <div>
            <label className="form-label">ملاحظات</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pb-2">
          <button type="button" className="btn-primary" onClick={() => onSave({ car_type: carType, service_type: serviceType, cash_paid: Number(cash) || 0, card_paid: Number(card) || 0, notes })}>حفظ</button>
          <button type="button" className="btn-secondary" onClick={onCancel}>إلغاء</button>
        </div>
      </td>
    </tr>
  );
}
