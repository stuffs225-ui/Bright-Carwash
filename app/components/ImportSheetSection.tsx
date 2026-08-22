"use client";

import "@/lib/chartRegistry";
import { useMemo, useRef, useState } from "react";
import { Bar } from "react-chartjs-2";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";
import { describeError } from "@/lib/errors";
import { formatCurrency, toDateKey } from "@/lib/business";
import { showToast } from "@/lib/toast";
import { entryKey, expenseKey, parseSheet, type ParsedImport } from "@/lib/importSheet";
import { MetricCard } from "./MetricCard";

type Preview = {
  parsed: ParsedImport;
  newEntries: ParsedImport["entries"];
  newExpenses: ParsedImport["expenses"];
};

const BATCH_SIZE = 500;
const TABLE_PREVIEW_LIMIT = 150;

async function insertInBatches(table: "entries" | "expenses", rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
  }
}

function monthKey(occurredAt: string): string {
  const d = new Date(occurredAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ImportSheetSection() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setAnalyzing(true);
    setPreview(null);
    setShowAllEntries(false);
    setShowAllExpenses(false);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseSheet(buffer);

      // نجيب كل السجلات الموجودة فعلاً (أعمدة المطابقة فقط) لتحديد الجديد
      const [existingEntries, existingExpenses] = await Promise.all([
        fetchAllRows<{ occurred_at: string; car_type: string; service_type: string; cash_paid: number; card_paid: number }>(
          (from, to) =>
            supabase
              .from("entries")
              .select("occurred_at, car_type, service_type, cash_paid, card_paid")
              .is("deleted_at", null)
              .range(from, to)
        ),
        fetchAllRows<{ occurred_at: string; expense_type: string; amount: number }>((from, to) =>
          supabase.from("expenses").select("occurred_at, expense_type, amount").is("deleted_at", null).range(from, to)
        ),
      ]);

      const existingEntryKeys = new Set(existingEntries.map(entryKey));
      const existingExpenseKeys = new Set(existingExpenses.map(expenseKey));

      const newEntries = parsed.entries.filter((e) => !existingEntryKeys.has(entryKey(e)));
      const newExpenses = parsed.expenses.filter((x) => !existingExpenseKeys.has(expenseKey(x)));

      setPreview({ parsed, newEntries, newExpenses });
    } catch (err) {
      showToast("تعذّر التحليل: " + describeError(err), "error");
    } finally {
      setAnalyzing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    try {
      if (preview.newEntries.length > 0) await insertInBatches("entries", preview.newEntries);
      if (preview.newExpenses.length > 0) await insertInBatches("expenses", preview.newExpenses);
      showToast(`تمت الإضافة: ${preview.newEntries.length} سيارة و ${preview.newExpenses.length} مصروف جديد.`);
      setPreview(null);
    } catch (err) {
      showToast("فشل الاستيراد: " + describeError(err), "error");
    } finally {
      setImporting(false);
    }
  }

  const existingEntriesCount = preview ? preview.parsed.entries.length - preview.newEntries.length : 0;
  const existingExpensesCount = preview ? preview.parsed.expenses.length - preview.newExpenses.length : 0;

  // مقارنة شهرية: عدد السيارات بالملف مقابل كم منها جديد فعلاً — تُبنى فقط
  // للأشهر اللي فيها أي سجل جديد، عشان الرسم يبقى مفيداً لا مزدحماً بأشهر ثابتة.
  const monthlyComparison = useMemo(() => {
    if (!preview) return [];
    const newMonths = new Set(preview.newEntries.map((e) => monthKey(e.occurred_at)));
    if (newMonths.size === 0) return [];
    const totals = new Map<string, { inFile: number; newCount: number }>();
    for (const e of preview.parsed.entries) {
      const mk = monthKey(e.occurred_at);
      if (!newMonths.has(mk)) continue;
      const row = totals.get(mk) || { inFile: 0, newCount: 0 };
      row.inFile += 1;
      totals.set(mk, row);
    }
    for (const e of preview.newEntries) {
      const mk = monthKey(e.occurred_at);
      const row = totals.get(mk)!;
      row.newCount += 1;
    }
    return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [preview]);

  return (
    <section className="card">
      <h2 className="section-title mb-1">استيراد من ملف إكسل (Google Sheets)</h2>
      <p className="txt-muted text-sm mb-4">
        ارفع نفس ملف إكسل بتنسيق Main_Data + Expenses (نفس ملف الترحيل الأصلي). يُضاف فقط ما هو
        غير موجود بالنظام حالياً — مطابقة حسب التاريخ والوقت ونوع السيارة/الخدمة والمبلغ — بدون أي
        تعديل أو حذف لسجل موجود.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        disabled={analyzing || importing}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {analyzing && <p className="txt-muted text-sm mt-3">جارٍ تحليل الملف ومقارنته بالنظام...</p>}

      {preview && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="بالملف" value={`${preview.parsed.entries.length} 🚗 / ${preview.parsed.expenses.length} 💳`} tone="slate" />
            <MetricCard label="موجود مسبقاً" value={`${existingEntriesCount} 🚗 / ${existingExpensesCount} 💳`} tone="amber" />
            <MetricCard label="سيارات جديدة" value={preview.newEntries.length} tone="emerald" />
            <MetricCard label="مصروفات جديدة" value={preview.newExpenses.length} tone="emerald" />
          </div>

          {(preview.parsed.skippedEntries > 0 || preview.parsed.skippedExpenses > 0) && (
            <p className="txt-muted text-sm">
              تم تجاهل {preview.parsed.skippedEntries} صف سيارات و {preview.parsed.skippedExpenses} صف مصروفات ناقصة البيانات بالملف.
            </p>
          )}

          {preview.newEntries.length === 0 && preview.newExpenses.length === 0 ? (
            <p className="txt-muted">لا يوجد شيء جديد لإضافته — كل محتوى الملف موجود بالنظام مسبقاً.</p>
          ) : (
            <>
              {monthlyComparison.length > 0 && (
                <div>
                  <h3 className="subsection-title">مقارنة الأشهر المتأثرة: إجمالي بالملف مقابل الجديد فعلاً</h3>
                  <div className="chart-box">
                    <Bar
                      data={{
                        labels: monthlyComparison.map(([m]) => m),
                        datasets: [
                          { label: "إجمالي بالملف", data: monthlyComparison.map(([, v]) => v.inFile), backgroundColor: "#94a3b8" },
                          { label: "جديد وسيُضاف", data: monthlyComparison.map(([, v]) => v.newCount), backgroundColor: "#059669" },
                        ],
                      }}
                      options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }}
                    />
                  </div>
                </div>
              )}

              {preview.newEntries.length > 0 && (
                <div>
                  <h3 className="subsection-title">السيارات الجديدة اللي بتنضاف ({preview.newEntries.length})</h3>
                  <div className="overflow-x-auto" style={{ maxHeight: 340, overflowY: "auto" }}>
                    <table className="app-table">
                      <thead>
                        <tr><th>التاريخ</th><th>السيارة</th><th>الخدمة</th><th>كاش</th><th>بطاقة</th></tr>
                      </thead>
                      <tbody>
                        {(showAllEntries ? preview.newEntries : preview.newEntries.slice(0, TABLE_PREVIEW_LIMIT)).map((e, i) => (
                          <tr key={i}>
                            <td data-label="التاريخ">{toDateKey(new Date(e.occurred_at))}</td>
                            <td data-label="السيارة">{e.car_type}</td>
                            <td data-label="الخدمة">{e.service_type}</td>
                            <td data-label="كاش" className="txt-cash">{formatCurrency(e.cash_paid)}</td>
                            <td data-label="بطاقة" className="txt-card">{formatCurrency(e.card_paid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!showAllEntries && preview.newEntries.length > TABLE_PREVIEW_LIMIT && (
                    <button type="button" className="link-inline mt-2" onClick={() => setShowAllEntries(true)}>
                      عرض الباقي ({preview.newEntries.length - TABLE_PREVIEW_LIMIT})
                    </button>
                  )}
                </div>
              )}

              {preview.newExpenses.length > 0 && (
                <div>
                  <h3 className="subsection-title">المصروفات الجديدة اللي بتنضاف ({preview.newExpenses.length})</h3>
                  <div className="overflow-x-auto" style={{ maxHeight: 340, overflowY: "auto" }}>
                    <table className="app-table">
                      <thead>
                        <tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th></tr>
                      </thead>
                      <tbody>
                        {(showAllExpenses ? preview.newExpenses : preview.newExpenses.slice(0, TABLE_PREVIEW_LIMIT)).map((x, i) => (
                          <tr key={i}>
                            <td data-label="التاريخ">{toDateKey(new Date(x.occurred_at))}</td>
                            <td data-label="النوع">{x.expense_type}</td>
                            <td data-label="المبلغ" className="txt-expense">{formatCurrency(x.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!showAllExpenses && preview.newExpenses.length > TABLE_PREVIEW_LIMIT && (
                    <button type="button" className="link-inline mt-2" onClick={() => setShowAllExpenses(true)}>
                      عرض الباقي ({preview.newExpenses.length - TABLE_PREVIEW_LIMIT})
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={importing} onClick={confirmImport}>
                  {importing ? <span className="spinner" /> : "تأكيد الإضافة"}
                </button>
                <button type="button" className="btn-secondary" disabled={importing} onClick={() => setPreview(null)}>
                  إلغاء
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
