"use client";

import "@/lib/chartRegistry";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, toDateKey } from "@/lib/business";
import { showToast } from "@/lib/toast";
import { buildReportMarkdown, downloadMarkdown, exportReportToExcel, type ReportInput } from "@/lib/exportReport";
import { computeDiagnostics } from "@/lib/diagnostics";
import { loadPresets } from "@/lib/presets";
import type { Entry, EntryPreset, Expense } from "@/lib/types";
import { MetricCard, type Tone } from "./MetricCard";
import { Modal } from "./Modal";

const PALETTE = ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706", "#0891b2", "#db2777", "#4f46e5", "#65a30d", "#9333ea"];

type DailyRow = { date: string; cars: number; cash: number; card: number; revenue: number; expenses: number; net: number };
type Granularity = "daily" | "weekly" | "monthly";

function toInputDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function breakdownToArray(obj: Record<string, number>) {
  return Object.entries(obj)
    .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value);
}

function emptyDay(date: string): DailyRow {
  return { date, cars: 0, cash: 0, card: 0, revenue: 0, expenses: 0, net: 0 };
}

function bucketByGranularity(daily: DailyRow[], granularity: Granularity): DailyRow[] {
  if (granularity === "daily") return daily;
  const map = new Map<string, DailyRow>();
  daily.forEach((d) => {
    let key: string;
    if (granularity === "weekly") {
      const dt = new Date(`${d.date}T00:00:00`);
      const weekStart = new Date(dt);
      weekStart.setDate(dt.getDate() - dt.getDay());
      key = toDateKey(weekStart);
    } else {
      key = d.date.slice(0, 7);
    }
    const row = map.get(key) || emptyDay(key);
    row.cars += d.cars;
    row.cash += d.cash;
    row.card += d.card;
    row.revenue += d.revenue;
    row.expenses += d.expenses;
    row.net += d.net;
    map.set(key, row);
  });
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function AnalysisTab() {
  const now = new Date();
  const [startDate, setStartDate] = useState(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toInputDate(now));
  const [carTypeFilter, setCarTypeFilter] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
  const [serviceTypeOptions, setServiceTypeOptions] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [activePeriod, setActivePeriod] = useState<"today" | "week" | "month" | "year" | null>(null);
  const [presets, setPresets] = useState<EntryPreset[]>([]);

  const load = useCallback(async (start: string, end: string, carFilter: string, serviceFilter: string) => {
    setLoading(true);
    const startDt = new Date(`${start}T00:00:00`);
    const endDt = new Date(`${end}T23:59:59.999`);

    let entryQuery = supabase
      .from("entries")
      .select("*")
      .is("deleted_at", null)
      .gte("occurred_at", startDt.toISOString())
      .lte("occurred_at", endDt.toISOString());
    if (carFilter) entryQuery = entryQuery.eq("car_type", carFilter);
    if (serviceFilter) entryQuery = entryQuery.eq("service_type", serviceFilter);

    const [{ data: entryRows, error: e1 }, { data: expenseRows, error: e2 }] = await Promise.all([
      entryQuery,
      supabase.from("expenses").select("*").is("deleted_at", null).gte("occurred_at", startDt.toISOString()).lte("occurred_at", endDt.toISOString()),
    ]);
    setLoading(false);
    if (e1 || e2) {
      showToast("خطأ في تحليل البيانات: " + (e1?.message || e2?.message), "error");
      return;
    }
    setEntries((entryRows as Entry[]) || []);
    setExpenses((expenseRows as Expense[]) || []);
  }, []);

  const loadHistory = useCallback(async () => {
    const [{ data: e }, { data: x }] = await Promise.all([
      supabase.from("entries").select("*").is("deleted_at", null),
      supabase.from("expenses").select("*").is("deleted_at", null),
    ]);
    setAllEntries((e as Entry[]) || []);
    setAllExpenses((x as Expense[]) || []);
  }, []);

  useEffect(() => {
    load(startDate, endDate, carTypeFilter, serviceTypeFilter);
    loadHistory();
    loadPresets().then(setPresets);

    supabase
      .from("car_types")
      .select("name")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setCarTypeOptions((data || []).map((c) => c.name)));
    supabase
      .from("service_types")
      .select("name")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setServiceTypeOptions((data || []).map((s) => s.name)));

    const channel = supabase
      .channel("analysis-history-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => loadHistory())
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => loadHistory())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runFilter(start = startDate, end = endDate, car = carTypeFilter, service = serviceTypeFilter) {
    load(start, end, car, service);
  }

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    const s = toInputDate(start);
    const e = toInputDate(end);
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  function applyCurrentMonth() {
    const s = toInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const e = toInputDate(now);
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  function applyLastMonth() {
    const s = toInputDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const e = toInputDate(new Date(now.getFullYear(), now.getMonth(), 0));
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  function applyCurrentQuarter() {
    const q = Math.floor(now.getMonth() / 3);
    const s = toInputDate(new Date(now.getFullYear(), q * 3, 1));
    const e = toInputDate(now);
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  function applyLastYear() {
    const y = now.getFullYear() - 1;
    const s = toInputDate(new Date(y, 0, 1));
    const e = toInputDate(new Date(y, 11, 31));
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  // ---------------- نظرة سريعة (اليوم / الأسبوع / الشهر / السنة) — مستقلة عن الفلتر ----------------
  const quickGlance = useMemo(() => {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    function sumSince(since: Date) {
      let revenue = 0, cars = 0, expensesTotal = 0;
      allEntries.forEach((e) => {
        if (new Date(e.occurred_at) >= since) {
          revenue += Number(e.gross);
          cars += 1;
        }
      });
      allExpenses.forEach((x) => {
        if (new Date(x.occurred_at) >= since) expensesTotal += Number(x.amount);
      });
      return { revenue, cars, expenses: expensesTotal, net: revenue - expensesTotal, since };
    }

    return {
      today: sumSince(todayStart),
      week: sumSince(weekStart),
      month: sumSince(monthStart),
      year: sumSince(yearStart),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEntries, allExpenses]);

  const roi = useMemo(() => {
    const yearly = quickGlance.year.expenses > 0 ? (quickGlance.year.net / quickGlance.year.expenses) * 100 : 0;
    const monthly = quickGlance.month.expenses > 0 ? (quickGlance.month.net / quickGlance.month.expenses) * 100 : 0;
    return { yearly, monthly };
  }, [quickGlance]);

  // ---------------- سجل شهري كامل منذ بداية التشغيل ----------------
  const monthlyHistory = useMemo(() => {
    const map = new Map<string, { month: string; cars: number; revenue: number; expenses: number }>();
    allEntries.forEach((e) => {
      const d = new Date(e.occurred_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = map.get(key) || { month: key, cars: 0, revenue: 0, expenses: 0 };
      row.cars += 1;
      row.revenue += Number(e.gross);
      map.set(key, row);
    });
    allExpenses.forEach((x) => {
      const d = new Date(x.occurred_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = map.get(key) || { month: key, cars: 0, revenue: 0, expenses: 0 };
      row.expenses += Number(x.amount);
      map.set(key, row);
    });
    return Array.from(map.values())
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((r) => ({ ...r, net: r.revenue - r.expenses }));
  }, [allEntries, allExpenses]);

  const last12Months = useMemo(() => [...monthlyHistory].slice(0, 12).reverse(), [monthlyHistory]);

  // ---------------- تحليل الفترة المفلترة ----------------
  const analysis = useMemo(() => {
    const daily = new Map<string, DailyRow>();
    const carTypes: Record<string, number> = {};
    const serviceTypes: Record<string, number> = {};
    const expenseTypes: Record<string, number> = {};
    let cars = 0, revenue = 0, cash = 0, card = 0, expenseTotal = 0;

    entries.forEach((entry) => {
      const key = toDateKey(new Date(entry.occurred_at));
      if (!daily.has(key)) daily.set(key, emptyDay(key));
      const row = daily.get(key)!;
      row.cars += 1;
      row.cash += Number(entry.cash_paid);
      row.card += Number(entry.card_paid);
      row.revenue += Number(entry.gross);
      cars += 1;
      cash += Number(entry.cash_paid);
      card += Number(entry.card_paid);
      revenue += Number(entry.gross);
      carTypes[entry.car_type] = (carTypes[entry.car_type] || 0) + Number(entry.gross);
      serviceTypes[entry.service_type] = (serviceTypes[entry.service_type] || 0) + Number(entry.gross);
    });

    expenses.forEach((exp) => {
      const key = toDateKey(new Date(exp.occurred_at));
      if (!daily.has(key)) daily.set(key, emptyDay(key));
      const row = daily.get(key)!;
      row.expenses += Number(exp.amount);
      expenseTotal += Number(exp.amount);
      expenseTypes[exp.expense_type] = (expenseTypes[exp.expense_type] || 0) + Number(exp.amount);
    });

    daily.forEach((row) => (row.net = row.revenue - row.expenses));
    const dailyArray = Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));
    const activeDays = dailyArray.filter((d) => d.cars > 0).length;

    return {
      metrics: {
        cars,
        revenue,
        cash,
        card,
        expenses: expenseTotal,
        net: revenue - expenseTotal,
        avgTicket: cars ? revenue / cars : 0,
        avgCarsPerActiveDay: activeDays ? cars / activeDays : 0,
      },
      daily: dailyArray,
      carTypes: breakdownToArray(carTypes),
      serviceTypes: breakdownToArray(serviceTypes),
      expenseTypes: breakdownToArray(expenseTypes),
      paymentMethods: [
        { label: "كاش", value: Number(cash.toFixed(2)) },
        { label: "بطاقة", value: Number(card.toFixed(2)) },
      ],
    };
  }, [entries, expenses]);

  const bucketedTrend = useMemo(() => bucketByGranularity(analysis.daily, granularity), [analysis.daily, granularity]);

  const m = analysis.metrics;

  function buildReport(): ReportInput {
    return {
      startDate,
      endDate,
      daily: analysis.daily,
      carTypes: analysis.carTypes,
      serviceTypes: analysis.serviceTypes,
      expenseTypes: analysis.expenseTypes,
      metrics: {
        cars: m.cars,
        revenue: m.revenue,
        cash: m.cash,
        card: m.card,
        expenses: m.expenses,
        net: m.net,
        avgTicket: m.avgTicket,
      },
      diagnostics: computeDiagnostics(entries, expenses, presets, startDate, endDate),
    };
  }

  async function handleExportExcel() {
    await exportReportToExcel(`تقرير-${startDate}-الى-${endDate}`, buildReport());
  }

  function handleExportMarkdown() {
    downloadMarkdown(`تقرير-${startDate}-الى-${endDate}`, buildReportMarkdown(buildReport()));
  }

  function handleExportPdf() {
    window.print();
  }

  const periodLabels: Record<string, string> = { today: "اليوم", week: "هذا الأسبوع", month: "هذا الشهر", year: "هذي السنة" };
  const periodEntries = useMemo(() => {
    if (!activePeriod) return [];
    const since = quickGlance[activePeriod].since;
    return allEntries
      .filter((e) => new Date(e.occurred_at) >= since)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }, [activePeriod, quickGlance, allEntries]);

  return (
    <div className="space-y-6">
      {/* نظرة سريعة — دوس على أي بطاقة لتفاصيل السيارات بهذي الفترة */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickCard label="دخل اليوم" net={quickGlance.today.net} sub={`${quickGlance.today.cars} سيارة`} tone="blue" onClick={() => setActivePeriod("today")} />
        <QuickCard label="ربح الأسبوع" net={quickGlance.week.net} sub={formatCurrency(quickGlance.week.revenue)} tone="emerald" onClick={() => setActivePeriod("week")} />
        <QuickCard label="ربح الشهر" net={quickGlance.month.net} sub={formatCurrency(quickGlance.month.revenue)} tone="purple" onClick={() => setActivePeriod("month")} />
        <QuickCard label="ربح السنة" net={quickGlance.year.net} sub={formatCurrency(quickGlance.year.revenue)} tone="indigo" onClick={() => setActivePeriod("year")} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="metric-card tone-cyan">
          <span className="metric-label">العائد على الاستثمار (سنوي) — مقارنة الربح بإجمالي المصروفات</span>
          <strong className={`metric-value ${roi.yearly < 0 ? "txt-expense" : ""}`}>{roi.yearly.toFixed(1)}%</strong>
        </div>
        <div className="metric-card tone-amber">
          <span className="metric-label">العائد على الاستثمار (شهري) — مقارنة الربح بإجمالي المصروفات</span>
          <strong className={`metric-value ${roi.monthly < 0 ? "txt-expense" : ""}`}>{roi.monthly.toFixed(1)}%</strong>
        </div>
      </section>

      {/* فلاتر */}
      <section className="card no-print">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
          <div>
            <h2 className="section-title mb-1">تحليل البيانات</h2>
            <p className="txt-muted">تحليل الإيرادات، السيارات، المصروفات وصافي الدخل للفترة المحددة.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full xl:w-auto">
            <div>
              <label className="form-label">من تاريخ</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">إلى تاريخ</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <button type="button" disabled={loading} className="btn-primary h-fit self-end" onClick={() => runFilter()}>تطبيق</button>
            <button type="button" className="btn-secondary h-fit self-end" onClick={applyCurrentMonth}>هذا الشهر</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="form-label">نوع السيارة</label>
            <div className="select-wrapper">
              <select value={carTypeFilter} onChange={(e) => { setCarTypeFilter(e.target.value); runFilter(undefined, undefined, e.target.value, undefined); }}>
                <option value="">الكل</option>
                {carTypeOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">نوع الخدمة</label>
            <div className="select-wrapper">
              <select value={serviceTypeFilter} onChange={(e) => { setServiceTypeFilter(e.target.value); runFilter(undefined, undefined, undefined, e.target.value); }}>
                <option value="">الكل</option>
                {serviceTypeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" className="analysis-preset" onClick={() => applyPreset(7)}>آخر 7 أيام</button>
          <button type="button" className="analysis-preset" onClick={() => applyPreset(30)}>آخر 30 يوم</button>
          <button type="button" className="analysis-preset" onClick={() => applyPreset(90)}>آخر 90 يوم</button>
          <button type="button" className="analysis-preset" onClick={applyLastMonth}>الشهر الماضي</button>
          <button type="button" className="analysis-preset" onClick={applyCurrentQuarter}>الربع الحالي</button>
          <button type="button" className="analysis-preset" onClick={applyLastYear}>السنة الماضية</button>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" className="btn-secondary" onClick={handleExportExcel}>⬇ تصدير Excel</button>
          <button type="button" className="btn-secondary" onClick={handleExportMarkdown}>⬇ تصدير تقرير (Markdown)</button>
          <button type="button" className="btn-secondary" onClick={handleExportPdf}>🖨 طباعة / PDF</button>
        </div>
      </section>

      <div id="printable-report" className="space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="عدد السيارات" value={m.cars} tone="blue" />
          <MetricCard label="الإيرادات" value={formatCurrency(m.revenue)} tone="emerald" />
          <MetricCard label="المصروفات" value={formatCurrency(m.expenses)} tone="red" />
          <MetricCard label="صافي الدخل" value={formatCurrency(m.net)} tone="indigo" />
          <MetricCard label="الكاش" value={formatCurrency(m.cash)} tone="cyan" />
          <MetricCard label="البطاقة" value={formatCurrency(m.card)} tone="purple" />
          <MetricCard label="متوسط الفاتورة" value={formatCurrency(m.avgTicket)} tone="amber" />
          <MetricCard label="متوسط السيارات / يوم عمل" value={m.avgCarsPerActiveDay.toFixed(2)} tone="slate" />
        </section>

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="subsection-title mb-0">اتجاه الأداء</h3>
            <div className="flex gap-2 no-print">
              {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={granularity === g ? "btn-primary" : "btn-secondary"}
                  onClick={() => setGranularity(g)}
                >
                  {g === "daily" ? "يومي" : g === "weekly" ? "أسبوعي" : "شهري"}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-box chart-box-lg">
            <Line
              data={{
                labels: bucketedTrend.map((d) => d.date),
                datasets: [
                  { label: "الإيرادات", data: bucketedTrend.map((d) => d.revenue), borderColor: "#059669", backgroundColor: "rgba(5,150,105,.12)", tension: 0.25 },
                  { label: "المصروفات", data: bucketedTrend.map((d) => d.expenses), borderColor: "#dc2626", backgroundColor: "rgba(220,38,38,.10)", tension: 0.25 },
                  { label: "صافي الدخل", data: bucketedTrend.map((d) => d.net), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.10)", tension: 0.25 },
                ],
              }}
              options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom" } } }}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="subsection-title">الإيراد حسب نوع السيارة</h3>
            <div className="chart-box"><BreakdownBar rows={analysis.carTypes} color="#2563eb" /></div>
          </div>
          <div className="card">
            <h3 className="subsection-title">الإيراد حسب نوع الخدمة</h3>
            <div className="chart-box"><BreakdownBar rows={analysis.serviceTypes} color="#7c3aed" /></div>
          </div>
          <div className="card">
            <h3 className="subsection-title">طريقة الدفع</h3>
            <div className="chart-box"><BreakdownDoughnut rows={analysis.paymentMethods} /></div>
          </div>
          <div className="card">
            <h3 className="subsection-title">المصروفات حسب النوع</h3>
            <div className="chart-box"><BreakdownDoughnut rows={analysis.expenseTypes} /></div>
          </div>
        </section>

        <section className="card overflow-hidden p-0">
          <button type="button" className={`accordion-button no-print ${showDaily ? "active" : ""}`} onClick={() => setShowDaily((v) => !v)}>
            <span>التفاصيل اليومية</span>
            <span>⌄</span>
          </button>
          <div className="accordion-content" style={{ maxHeight: showDaily ? "5000px" : undefined }}>
            <div className="p-4 overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr><th>التاريخ</th><th>السيارات</th><th>كاش</th><th>بطاقة</th><th>الإيراد</th><th>المصروفات</th><th>الصافي</th></tr>
                </thead>
                <tbody>
                  {analysis.daily.length === 0 ? (
                    <tr><td colSpan={7} className="text-center txt-muted py-5">لا توجد بيانات في الفترة المحددة.</td></tr>
                  ) : (
                    [...analysis.daily].reverse().map((d) => (
                      <tr key={d.date}>
                        <td data-label="التاريخ">{d.date}</td>
                        <td data-label="السيارات">{d.cars}</td>
                        <td data-label="كاش">{formatCurrency(d.cash)}</td>
                        <td data-label="بطاقة">{formatCurrency(d.card)}</td>
                        <td data-label="الإيراد" className="txt-cash">{formatCurrency(d.revenue)}</td>
                        <td data-label="المصروفات" className="txt-expense">{formatCurrency(d.expenses)}</td>
                        <td data-label="الصافي" className={`txt-net ${d.net < 0 ? "is-negative" : ""}`}>{formatCurrency(d.net)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* السجل الشهري الكامل منذ بداية التشغيل — مستقل عن الفلتر */}
      <section className="card overflow-hidden p-0 no-print">
        <button type="button" className={`accordion-button ${showHistory ? "active" : ""}`} onClick={() => setShowHistory((v) => !v)}>
          <span>السجل الشهري الكامل (منذ البداية)</span>
          <span>⌄</span>
        </button>
        <div className="accordion-content" style={{ maxHeight: showHistory ? "6000px" : undefined }}>
          <div className="p-4">
            <div className="chart-box chart-box-lg mb-6">
              <Bar
                data={{
                  labels: last12Months.map((r) => r.month),
                  datasets: [
                    { label: "الإيرادات", data: last12Months.map((r) => r.revenue), backgroundColor: "#059669" },
                    { label: "المصروفات", data: last12Months.map((r) => r.expenses), backgroundColor: "#dc2626" },
                    { label: "صافي الربح", data: last12Months.map((r) => r.net), backgroundColor: "#2563eb" },
                  ],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr><th>الشهر</th><th>السيارات</th><th>الإيراد</th><th>المصروفات</th><th>صافي الربح</th></tr>
                </thead>
                <tbody>
                  {monthlyHistory.map((r) => (
                    <tr key={r.month}>
                      <td data-label="الشهر">{r.month}</td>
                      <td data-label="السيارات">{r.cars}</td>
                      <td data-label="الإيراد" className="txt-cash">{formatCurrency(r.revenue)}</td>
                      <td data-label="المصروفات" className="txt-expense">{formatCurrency(r.expenses)}</td>
                      <td data-label="صافي الربح" className={`txt-net ${r.net < 0 ? "is-negative" : ""}`}>{formatCurrency(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {activePeriod && (
        <Modal title={`سيارات ${periodLabels[activePeriod]} (${periodEntries.length})`} onClose={() => setActivePeriod(null)}>
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead>
                <tr><th>التاريخ</th><th>الوقت</th><th>السيارة</th><th>الخدمة</th><th>الدفع</th><th>الإجمالي</th></tr>
              </thead>
              <tbody>
                {periodEntries.length === 0 ? (
                  <tr><td colSpan={6} className="text-center txt-muted py-5">لا توجد سيارات بهذي الفترة.</td></tr>
                ) : (
                  periodEntries.map((entry) => {
                    const d = new Date(entry.occurred_at);
                    return (
                      <tr key={entry.id}>
                        <td data-label="التاريخ">{toDateKey(d)}</td>
                        <td data-label="الوقت">{d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}</td>
                        <td data-label="السيارة">{entry.car_type}</td>
                        <td data-label="الخدمة">{entry.service_type}</td>
                        <td data-label="الدفع">{entry.payment_method}</td>
                        <td data-label="الإجمالي" className="font-extrabold">{formatCurrency(entry.gross)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}

function QuickCard({
  label,
  net,
  sub,
  tone,
  onClick,
}: {
  label: string;
  net: number;
  sub: string;
  tone: Tone;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`metric-card tone-${tone}`}>
      <span className="metric-label">{label}</span>
      <strong className={`metric-value ${net < 0 ? "txt-expense" : ""}`}>{formatCurrency(net)}</strong>
      <span className="text-xs txt-muted mt-1">{sub}</span>
    </button>
  );
}

function BreakdownBar({ rows, color }: { rows: { label: string; value: number }[]; color: string }) {
  return (
    <Bar
      data={{ labels: rows.map((r) => r.label), datasets: [{ label: "القيمة", data: rows.map((r) => r.value), backgroundColor: color, borderColor: color, borderWidth: 1 }] }}
      options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }}
    />
  );
}

function BreakdownDoughnut({ rows }: { rows: { label: string; value: number }[] }) {
  return (
    <Doughnut
      data={{
        labels: rows.map((r) => r.label),
        datasets: [{ data: rows.map((r) => r.value), backgroundColor: rows.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: "#fff", borderWidth: 2 }],
      }}
      options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }}
    />
  );
}
