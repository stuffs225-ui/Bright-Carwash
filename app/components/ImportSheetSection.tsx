"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";
import { showToast } from "@/lib/toast";
import { entryKey, expenseKey, parseSheet, type ParsedImport } from "@/lib/importSheet";

type Preview = {
  parsed: ParsedImport;
  newEntries: ParsedImport["entries"];
  newExpenses: ParsedImport["expenses"];
};

const BATCH_SIZE = 500;

async function insertInBatches(table: "entries" | "expenses", rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
  }
}

export function ImportSheetSection() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setAnalyzing(true);
    setPreview(null);
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
      showToast("تعذّرت قراءة الملف: " + (err instanceof Error ? err.message : String(err)), "error");
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
      showToast("فشل الاستيراد: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setImporting(false);
    }
  }

  const existingEntriesCount = preview ? preview.parsed.entries.length - preview.newEntries.length : 0;
  const existingExpensesCount = preview ? preview.parsed.expenses.length - preview.newExpenses.length : 0;

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
        <div className="card mt-4" style={{ background: "var(--surface-2)" }}>
          <p className="mb-2">
            بالملف: <b>{preview.parsed.entries.length}</b> سيارة و <b>{preview.parsed.expenses.length}</b> مصروف صالح للاستيراد
            {(preview.parsed.skippedEntries > 0 || preview.parsed.skippedExpenses > 0) && (
              <span className="txt-muted"> (تجاهلنا {preview.parsed.skippedEntries} صف سيارات و {preview.parsed.skippedExpenses} صف مصروفات ناقصة البيانات)</span>
            )}
          </p>
          <p className="mb-2 txt-muted">
            موجود مسبقاً بالنظام ولن يُكرَّر: {existingEntriesCount} سيارة و {existingExpensesCount} مصروف.
          </p>
          <p className="mb-4 font-extrabold txt-cash">
            جديد وسيُضاف الآن: {preview.newEntries.length} سيارة و {preview.newExpenses.length} مصروف.
          </p>
          {preview.newEntries.length === 0 && preview.newExpenses.length === 0 ? (
            <p className="txt-muted">لا يوجد شيء جديد لإضافته — كل محتوى الملف موجود بالنظام مسبقاً.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={importing} onClick={confirmImport}>
                {importing ? <span className="spinner" /> : "تأكيد الإضافة"}
              </button>
              <button type="button" className="btn-secondary" disabled={importing} onClick={() => setPreview(null)}>
                إلغاء
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
