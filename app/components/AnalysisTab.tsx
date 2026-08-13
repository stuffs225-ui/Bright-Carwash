"use client";

import "@/lib/chartRegistry";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, toDateKey } from "@/lib/business";
import { showToast } from "@/lib/toast";
import type { Entry, Expense } from "@/lib/types";
import { MetricCard } from "./MetricCard";

const PALETTE = ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706", "#0891b2", "#db2777", "#4f46e5", "#65a30d", "#9333ea"];

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

export function AnalysisTab() {
  const now = new Date();
  const [startDate, setStartDate] = useState(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toInputDate(now));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDaily, setShowDaily] = useState(false);

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    const startDt = new Date(`${start}T00:00:00`);
    const endDt = new Date(`${end}T23:59:59.999`);
    const [{ data: entryRows, error: e1 }, { data: expenseRows, error: e2 }] = await Promise.all([
      supabase.from("entries").select("*").gte("occurred_at", startDt.toISOString()).lte("occurred_at", endDt.toISOString()),
      supabase.from("expenses").select("*").gte("occurred_at", startDt.toISOString()).lte("occurred_at", endDt.toISOString()),
    ]);
    setLoading(false);
    if (e1 || e2) {
      showToast("خطأ في تحليل البيانات: " + (e1?.message || e2?.message), "error");
      return;
    }
    setEntries((entryRows as Entry[]) || []);
    setExpenses((expenseRows as Expense[]) || []);
  }, []);

  useEffect(() => {
    load(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    const s = toInputDate(start);
    const e = toInputDate(end);
    setStartDate(s);
    setEndDate(e);
    load(s, e);
  }

  function applyCurrentMonth() {
    const s = toInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const e = toInputDate(now);
    setStartDate(s);
    setEndDate(e);
    load(s, e);
  }

  const analysis = useMemo(() => {
    const daily = new Map<string, { date: string; cars: number; cash: number; card: number; revenue: number; expenses: number; net: number }>();
    const carTypes: Record<string, number> = {};
    const serviceTypes: Record<string, number> = {};
    const expenseTypes: Record<string, number> = {};
    let cars = 0, revenue = 0, cash = 0, card = 0, expenseTotal = 0;

    entries.forEach((entry) => {
      const key = toDateKey(new Date(entry.occurred_at));
      if (!daily.has(key)) daily.set(key, { date: key, cars: 0, cash: 0, card: 0, revenue: 0, expenses: 0, net: 0 });
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
      if (!daily.has(key)) daily.set(key, { date: key, cars: 0, cash: 0, card: 0, revenue: 0, expenses: 0, net: 0 });
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

  const m = analysis.metrics;

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
          <div>
            <h2 className="section-title mb-1">تحليل البيانات</h2>
            <p className="text-gray-500">تحليل الإيرادات، السيارات، المصروفات وصافي الدخل للفترة المحددة.</p>
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
            <button type="button" disabled={loading} className="btn-primary h-fit self-end" onClick={() => load(startDate, endDate)}>تطبيق</button>
            <button type="button" className="btn-secondary h-fit self-end" onClick={applyCurrentMonth}>هذا الشهر</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" className="analysis-preset" onClick={() => applyPreset(7)}>آخر 7 أيام</button>
          <button type="button" className="analysis-preset" onClick={() => applyPreset(30)}>آخر 30 يوم</button>
          <button type="button" className="analysis-preset" onClick={() => applyPreset(90)}>آخر 90 يوم</button>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="عدد السيارات" value={m.cars} bg="bg-blue-50" color="text-blue-700" />
        <MetricCard label="الإيرادات" value={formatCurrency(m.revenue)} bg="bg-emerald-50" color="text-emerald-700" />
        <MetricCard label="المصروفات" value={formatCurrency(m.expenses)} bg="bg-red-50" color="text-red-700" />
        <MetricCard label="صافي الدخل" value={formatCurrency(m.net)} bg="bg-indigo-50" color="text-indigo-700" />
        <MetricCard label="الكاش" value={formatCurrency(m.cash)} bg="bg-cyan-50" color="text-cyan-700" />
        <MetricCard label="البطاقة" value={formatCurrency(m.card)} bg="bg-purple-50" color="text-purple-700" />
        <MetricCard label="متوسط الفاتورة" value={formatCurrency(m.avgTicket)} bg="bg-amber-50" color="text-amber-700" />
        <MetricCard label="متوسط السيارات / يوم عمل" value={m.avgCarsPerActiveDay.toFixed(2)} bg="bg-slate-50" color="text-slate-700" />
      </section>

      <section className="card">
        <h3 className="subsection-title">اتجاه الأداء اليومي</h3>
        <div className="chart-box chart-box-lg">
          <Line
            data={{
              labels: analysis.daily.map((d) => d.date),
              datasets: [
                { label: "الإيرادات", data: analysis.daily.map((d) => d.revenue), borderColor: "#059669", backgroundColor: "rgba(5,150,105,.12)", tension: 0.25 },
                { label: "المصروفات", data: analysis.daily.map((d) => d.expenses), borderColor: "#dc2626", backgroundColor: "rgba(220,38,38,.10)", tension: 0.25 },
                { label: "صافي الدخل", data: analysis.daily.map((d) => d.net), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.10)", tension: 0.25 },
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
        <button type="button" className={`accordion-button ${showDaily ? "active" : ""}`} onClick={() => setShowDaily((v) => !v)}>
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
                  <tr><td colSpan={7} className="text-center text-gray-500 py-5">لا توجد بيانات في الفترة المحددة.</td></tr>
                ) : (
                  [...analysis.daily].reverse().map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{d.cars}</td>
                      <td>{formatCurrency(d.cash)}</td>
                      <td>{formatCurrency(d.card)}</td>
                      <td className="text-green-700 font-bold">{formatCurrency(d.revenue)}</td>
                      <td className="text-red-700 font-bold">{formatCurrency(d.expenses)}</td>
                      <td className={`font-extrabold ${d.net < 0 ? "text-red-700" : "text-blue-700"}`}>{formatCurrency(d.net)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
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
