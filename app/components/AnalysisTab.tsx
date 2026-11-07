"use client";

import "@/lib/chartRegistry";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";
import { describeError } from "@/lib/errors";
import { formatCurrency, toDateKey } from "@/lib/business";
import {riyadhDayKey} from "@/lib/carwashCalendarDay";
import { showToast } from "@/lib/toast";
import { buildReportMarkdown, downloadMarkdown, exportReportToExcel, type ReportInput } from "@/lib/exportReport";
import { computeDiagnostics } from "@/lib/diagnostics";
import { loadPresets } from "@/lib/presets";
import type { Entry, EntryPreset, Expense } from "@/lib/types";
import { MetricCard, type Tone } from "./MetricCard";
import { Modal } from "./Modal";
import {operatingResult,expenseReturnPercent,displaySar,displayPercent,OPERATING_RESULT_NOTE} from "@/lib/financialPresentation";
import {ArabicDateField} from "./ArabicDateField";

const PALETTE = ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706", "#0891b2", "#db2777", "#4f46e5", "#65a30d", "#9333ea"];

type DailyRow = { date: string; cars: number; cash: number; card: number; revenue: number; expenses: number; net: number };
type Granularity = "daily" | "weekly" | "monthly";

function toInputDate(date:Date){return riyadhDayKey(date);}

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
      const dt = new Date(`${d.date}T12:00:00Z`);
      const weekStart = new Date(dt);
      weekStart.setUTCDate(dt.getUTCDate()-dt.getUTCDay());
      key = weekStart.toISOString().slice(0,10);
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
  const [startDate, setStartDate] = useState(riyadhDayKey(now).slice(0,7)+"-01");
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
  const [pendingReviewCount, setPendingReviewCount] = useState<number | null>(null);
  const [showDaily, setShowDaily] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [kpiDetails, setKpiDetails] = useState<"cars"|"revenue"|"expenses"|"net"|"cash"|"card"|"avgTicket"|"avgCars"|null>(null);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [activePeriod, setActivePeriod] = useState<"today" | "week" | "month" | "year" | null>(null);
  const [presets, setPresets] = useState<EntryPreset[]>([]);

  useEffect(() => {
    let disposed = false;
    // Archive differences from 2025 are preserved in the audit page; they are
    // not a new operational reconciliation alarm and should not block the dashboard.
    supabase.from("legacy_import_issues")
      .select("id",{count:"exact",head:true}).eq("status","pending")
      .then(({error,count})=>{
       if(!disposed)setPendingReviewCount(error?null:(count??0));
      });
    return () => {disposed=true;};
  }, []);

  const load = useCallback(async (start: string, end: string, carFilter: string, serviceFilter: string) => {
    setLoading(true);
    const startDt = new Date(`${start}T00:00:00+03:00`);
    const endDt = new Date(`${end}T23:59:59.999+03:00`);

    try {
      const [entryRows, expenseRows] = await Promise.all([
        fetchAllRows<Entry>((from, to) => {
          let q = supabase
            .from("entries")
            .select("*")
            .is("deleted_at", null)
            .gte("occurred_at", startDt.toISOString())
            .lte("occurred_at", endDt.toISOString())
            .order("occurred_at", { ascending: true })
            .range(from, to);
          if (carFilter) q = q.eq("car_type", carFilter);
          if (serviceFilter) q = q.eq("service_type", serviceFilter);
          return q;
        }),
        fetchAllRows<Expense>((from, to) =>
          supabase
            .from("expenses")
            .select("*")
            .is("deleted_at", null)
            .gte("occurred_at", startDt.toISOString())
            .lte("occurred_at", endDt.toISOString())
            .order("occurred_at", { ascending: true })
            .range(from, to)
        ),
      ]);
      setEntries(entryRows);
      setExpenses(expenseRows);
    } catch (err) {
      showToast("خطأ في تحليل البيانات: " + (describeError(err)), "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const [e, x] = await Promise.all([
        fetchAllRows<Entry>((from, to) =>
          supabase.from("entries").select("*").is("deleted_at", null).order("occurred_at", { ascending: true }).range(from, to)
        ),
        fetchAllRows<Expense>((from, to) =>
          supabase.from("expenses").select("*").is("deleted_at", null).order("occurred_at", { ascending: true }).range(from, to)
        ),
      ]);
      setAllEntries(e);
      setAllExpenses(x);
    } catch (err) {
      showToast("خطأ في تحميل السجل الكامل: " + (describeError(err)), "error");
    }
  }, []);

  useEffect(() => {
    // بالتتابع لا بالتوازي — نطلب كل السجلات التاريخية (7+ صفحات لكل جدول)
    // مرتين بنفس اللحظة كان يزاحم الشبكة على الجوال ويسبب فشل لحظي.
    load(startDate, endDate, carTypeFilter, serviceTypeFilter).then(loadHistory);
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
    const e=riyadhDayKey(new Date());
    const start=new Date(e+"T12:00:00Z");
    start.setUTCDate(start.getUTCDate()-days+1);
    const s=start.toISOString().slice(0,10);
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  function applyCurrentMonth() {
    const e=riyadhDayKey(new Date());
    const s=e.slice(0,7)+"-01";
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  function applyLastMonth() {
    const current=riyadhDayKey(new Date()).slice(0,7);
    const d=new Date(current+"-01T12:00:00Z");d.setUTCDate(0);
    const e=d.toISOString().slice(0,10);
    const s=e.slice(0,7)+"-01";
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  function applyCurrentQuarter() {
    const e=riyadhDayKey(new Date());
    const y=Number(e.slice(0,4)),m=Number(e.slice(5,7));
    const s=y+"-"+String(Math.floor((m-1)/3)*3+1).padStart(2,"0")+"-01";
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  function applyLastYear() {
    const y=Number(riyadhDayKey(new Date()).slice(0,4))-1;
    const s=y+"-01-01",e=y+"-12-31";
    setStartDate(s);
    setEndDate(e);
    runFilter(s, e);
  }

  // ---------------- نظرة سريعة (اليوم / الأسبوع / الشهر / السنة) — مستقلة عن الفلتر ----------------
  const quickGlance = useMemo(() => {
    const todayKey=riyadhDayKey(now);
    const todayStart = new Date(todayKey+"T00:00:00+03:00");
    const localNoon=new Date(todayKey+"T12:00:00Z");
    localNoon.setUTCDate(localNoon.getUTCDate()-localNoon.getUTCDay());
    const weekStart=new Date(localNoon.toISOString().slice(0,10)+"T00:00:00+03:00");
    const monthStart = new Date(todayKey.slice(0,7)+"-01T00:00:00+03:00");
    const yearStart = new Date(todayKey.slice(0,4)+"-01-01T00:00:00+03:00");

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
    const yearly = expenseReturnPercent(quickGlance.year.revenue,quickGlance.year.expenses);
    const monthly = expenseReturnPercent(quickGlance.month.revenue,quickGlance.month.expenses);
    return { yearly, monthly };
  }, [quickGlance]);

  // ---------------- سجل شهري كامل منذ بداية التشغيل ----------------
  const monthlyHistory = useMemo(() => {
    const map = new Map<string, { month: string; cars: number; revenue: number; expenses: number }>();
    allEntries.forEach((e) => {
      const d = new Date(e.occurred_at);
      const key = riyadhDayKey(d).slice(0,7);
      const row = map.get(key) || { month: key, cars: 0, revenue: 0, expenses: 0 };
      row.cars += 1;
      row.revenue += Number(e.gross);
      map.set(key, row);
    });
    allExpenses.forEach((x) => {
      const d = new Date(x.occurred_at);
      const key = riyadhDayKey(d).slice(0,7);
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
      const key = riyadhDayKey(entry.occurred_at);
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
      const key = riyadhDayKey(exp.occurred_at);
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
      {pendingReviewCount !== null && pendingReviewCount > 0 ? (
        <section className="card" role="status">
          <h2 className="section-title">مراجعة بيانات ترحيل معلقة</h2>
          <p className="txt-warning">يوجد {pendingReviewCount} بند ترحيل يحتاج توثيقًا. اختلافات الإجمالي التاريخية محفوظة في صفحة تدقيق الأرشيف دون تغيير أي مبلغ.</p>
        </section>
      ) : null}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <QuickCard label="إيرادات اليوم" net={quickGlance.today.revenue} sub={`${quickGlance.today.cars} سيارة`} tone="blue" onClick={() => setActivePeriod("today")} />
        <QuickCard label="نتيجة الأسبوع" net={quickGlance.week.net} sub={`الإيرادات: ${displaySar(quickGlance.week.revenue)}`} tone="emerald" result onClick={() => setActivePeriod("week")} />
        <QuickCard label="نتيجة الشهر" net={quickGlance.month.net} sub={`الإيرادات: ${displaySar(quickGlance.month.revenue)}`} tone="purple" result onClick={() => setActivePeriod("month")} />
        <QuickCard label="نتيجة السنة" net={quickGlance.year.net} sub={`الإيرادات: ${displaySar(quickGlance.year.revenue)}`} tone="indigo" result onClick={() => setActivePeriod("year")} />
      </section>
      <p className="txt-muted text-xs leading-relaxed -mt-2">{OPERATING_RESULT_NOTE}</p>
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="metric-card tone-cyan">
          <span className="metric-label">العائد على المصروفات — سنوي</span>
          <strong dir="ltr" className={`metric-value ${roi.yearly!==null&&roi.yearly<0?"txt-expense":""}`}>{displayPercent(roi.yearly)}</strong>
          <span className="text-xs txt-muted mt-1">النتيجة المسجلة ÷ المصروفات</span>
        </div>
        <div className="metric-card tone-amber">
          <span className="metric-label">العائد على المصروفات — شهري</span>
          <strong dir="ltr" className={`metric-value ${roi.monthly!==null&&roi.monthly<0?"txt-expense":""}`}>{displayPercent(roi.monthly)}</strong>
          <span className="text-xs txt-muted mt-1">النتيجة المسجلة ÷ المصروفات</span>
        </div>
      </section>

      {/* فلاتر */}
      <section className="card no-print">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
          <div>
            <h2 className="section-title mb-1">تحليل البيانات</h2>
            <p className="txt-muted">تحليل الإيرادات والمصروفات والنتيجة المسجلة، مع بيان السيارات والخدمات.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full xl:w-auto">
            <div>
              <label className="form-label">من تاريخ</label>
              <ArabicDateField value={startDate} onChange={setStartDate} ariaLabel="تاريخ البداية" />
            </div>
            <div>
              <label className="form-label">إلى تاريخ</label>
              <ArabicDateField value={endDate} onChange={setEndDate} ariaLabel="تاريخ النهاية" />
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
          <MetricCard label="عدد السيارات" value={m.cars} tone="blue" onClick={()=>setKpiDetails("cars")} hint="انقر لتفاصيل السيارات" />
          <MetricCard label="الإيرادات" value={formatCurrency(m.revenue)} tone="emerald" onClick={()=>setKpiDetails("revenue")} hint="تفاصيل الإيرادات" />
          <MetricCard label="المصروفات" value={formatCurrency(m.expenses)} tone="red" onClick={()=>setKpiDetails("expenses")} hint="تفاصيل المصروفات" />
          <MetricCard label="النتيجة المالية المسجلة" value={`${operatingResult(m.revenue,m.expenses).label} ${displaySar(m.net)}`} tone={m.net<0?"red":"indigo"} onClick={()=>setKpiDetails("net")} hint="تفاصيل الإيرادات والمصروفات" />
          <MetricCard label="الكاش" value={formatCurrency(m.cash)} tone="cyan" onClick={()=>setKpiDetails("cash")} hint="تفاصيل النقد المقبوض" />
          <MetricCard label="البطاقة" value={formatCurrency(m.card)} tone="purple" onClick={()=>setKpiDetails("card")} hint="تفاصيل الشبكة" />
          <MetricCard label="متوسط الفاتورة" value={formatCurrency(m.avgTicket)} tone="amber" onClick={()=>setKpiDetails("avgTicket")} hint="حساب المتوسط ومصدره" />
          <MetricCard label="متوسط السيارات / يوم عمل" value={m.avgCarsPerActiveDay.toFixed(2)} tone="slate" onClick={()=>setKpiDetails("avgCars")} hint="تفاصيل أيام العمل" />
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
                  { label: "النتيجة المالية المسجلة", data: bucketedTrend.map((d) => d.net), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.10)", tension: 0.25 },
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
                    { label: "الفائض المسجل", data: last12Months.map((r) => r.net), backgroundColor: "#2563eb" },
                  ],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr><th>الشهر</th><th>السيارات</th><th>الإيراد</th><th>المصروفات</th><th>الفائض المسجل</th></tr>
                </thead>
                <tbody>
                  {monthlyHistory.map((r) => (
                    <tr key={r.month}>
                      <td data-label="الشهر">{r.month}</td>
                      <td data-label="السيارات">{r.cars}</td>
                      <td data-label="الإيراد" className="txt-cash">{formatCurrency(r.revenue)}</td>
                      <td data-label="المصروفات" className="txt-expense">{formatCurrency(r.expenses)}</td>
                      <td data-label="الفائض المسجل" className={`txt-net ${r.net < 0 ? "is-negative" : ""}`}>{formatCurrency(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {kpiDetails && (
        <Modal title={({
          cars:"تفاصيل عدد السيارات",revenue:"تفاصيل الإيرادات",expenses:"تفاصيل المصروفات",
          net:"تفاصيل النتيجة المالية المسجلة",cash:"تفاصيل الكاش",card:"تفاصيل الشبكة",
          avgTicket:"متوسط الفاتورة",avgCars:"متوسط السيارات لكل يوم عمل"
        } as const)[kpiDetails]} onClose={()=>setKpiDetails(null)}>
          <p className="font-bold mb-3">
            {kpiDetails==="net"
              ? `الإيراد ${formatCurrency(m.revenue)} − المصروفات ${formatCurrency(m.expenses)} = ${formatCurrency(m.net)}`
              :kpiDetails==="avgTicket"
                ? `${formatCurrency(m.revenue)} ÷ ${m.cars} سيارة = ${formatCurrency(m.avgTicket)}`
                :kpiDetails==="avgCars"
                  ? `${m.cars} سيارة ÷ أيام العمل الفعلية = ${m.avgCarsPerActiveDay.toFixed(2)}`
                  :kpiDetails==="expenses"?formatCurrency(m.expenses)
                    :kpiDetails==="cash"?formatCurrency(m.cash)
                      :kpiDetails==="card"?formatCurrency(m.card)
                        :kpiDetails==="revenue"?formatCurrency(m.revenue):`${m.cars} سيارة`}
          </p>
          {(kpiDetails==="expenses"||kpiDetails==="net") && <>
            <h4 className="font-semibold mb-2">تفاصيل المصروفات</h4>
            <div className="space-y-2 mb-4">{expenses.length===0?<p className="txt-muted">لا توجد مصروفات.</p>:
              expenses.map((e,i)=><div key={e.id||i} className="border-b py-2 flex justify-between gap-2">
                <span>{new Date(e.occurred_at).toLocaleDateString("en-GB",{timeZone:"Asia/Riyadh"})} · {e.expense_type} · {e.notes||"—"}</span>
                <strong>{formatCurrency(e.amount)}</strong>
              </div>)}</div>
          </>}
          {kpiDetails!=="expenses" && <>
            <h4 className="font-semibold mb-2">تفاصيل السيارات والتحصيل</h4>
            <div className="space-y-2">{entries.filter(e=>
              kpiDetails==="cash"?Number(e.cash_paid)>0:
              kpiDetails==="card"?Number(e.card_paid)>0:true
            ).map((e,i)=><div key={e.id} className="border-b py-2">
              <div className="flex justify-between gap-2">
                <span>#{i+1} · {e.car_type} · {e.service_type}</span>
                <strong>{formatCurrency(kpiDetails==="cash"?e.cash_paid:kpiDetails==="card"?e.card_paid:e.gross)}</strong>
              </div>
              <p className="txt-muted text-sm">{new Date(e.occurred_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})} · كاش {formatCurrency(e.cash_paid)} · شبكة {formatCurrency(e.card_paid)} · خصم {formatCurrency(e.discount_amount||0)}</p>
            </div>)}</div>
          </>}
        </Modal>
      )}

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
                        <td data-label="التاريخ">{riyadhDayKey(d)}</td>
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
 label,net,sub,tone,onClick,result=false
}:{
 label:string;net:number;sub:string;tone:Tone;onClick:()=>void;result?:boolean
}){
 const status=operatingResult(net,0);
 return <button type="button" onClick={onClick}
  aria-label={`${label}: ${result?status.label+" ":""}${displaySar(net)}. ${sub}`}
  className={`metric-card tone-${tone} w-full`}>
  <span className="metric-label">{label}</span>
  <strong className={`metric-value ${net<0?"txt-expense":""}`}>
   {result?status.label+" ":""}{displaySar(net)}
  </strong>
  <span className="text-xs txt-muted mt-1">{sub}</span>
 </button>;
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
