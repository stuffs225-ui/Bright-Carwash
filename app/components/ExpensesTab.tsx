"use client";

import "@/lib/chartRegistry";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Doughnut } from "react-chartjs-2";
import { supabase } from "@/lib/supabaseClient";
import { AR_GREGORIAN_LOCALE, formatCurrency } from "@/lib/business";
import { showToast } from "@/lib/toast";
import type { Expense } from "@/lib/types";
import { enqueue } from "@/lib/offlineQueue";
import { isNetworkError } from "@/lib/offlineSync";
import { MetricCard } from "./MetricCard";
import { PAYMENT_SOURCES, addLedgerEntry, loadWorkers } from "@/lib/workers";
import type { Worker } from "@/lib/types";

const DEFAULT_COLORS = ["#3b82f6", "#8b5cf6", "#ef4444", "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#6d28d9", "#06b6d4", "#eab308"];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function ExpensesTab() {
  const [expenseTypes, setExpenseTypes] = useState<{ name: string; color: string }[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEntries, setShowEntries] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [expenseType, setExpenseType] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  // ربط مصروف الراتب بدفتر العامل
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerId, setWorkerId] = useState("");
  const [paymentSource, setPaymentSource] = useState("cash");
  const isSalary = expenseType === "راتب";

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    expenseTypes.forEach((t, i) => {
      map[t.name] = t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    });
    return map;
  }, [expenseTypes]);

  const loadTypes = useCallback(async () => {
    const { data } = await supabase.from("expense_types").select("name, color").eq("active", true).order("sort_order");
    setExpenseTypes(data || []);
  }, []);

  const loadExpenses = useCallback(async () => {
    const { data } = await supabase.from("expenses").select("*").is("deleted_at", null).order("occurred_at", { ascending: false });
    setExpenses((data as Expense[]) || []);
  }, []);

  useEffect(() => {
    loadTypes();
    loadExpenses();
    loadWorkers().then(setWorkers);
    const channel = supabase
      .channel("expenses-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => loadExpenses())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const map = new Map<string, { monthName: string; total: number; entries: Expense[]; types: Record<string, number> }>();
    expenses.forEach((exp) => {
      const d = new Date(exp.occurred_at);
      const key = monthKey(d);
      if (!map.has(key)) {
        map.set(key, { monthName: d.toLocaleDateString(AR_GREGORIAN_LOCALE, { month: "long", year: "numeric" }), total: 0, entries: [], types: {} });
      }
      const bucket = map.get(key)!;
      bucket.total += Number(exp.amount);
      bucket.entries.push(exp);
      bucket.types[exp.expense_type] = (bucket.types[exp.expense_type] || 0) + Number(exp.amount);
    });
    return map;
  }, [expenses]);

  const monthKeys = useMemo(() => Array.from(summary.keys()).sort().reverse(), [summary]);

  useEffect(() => {
    if (!selectedMonth && monthKeys.length) setSelectedMonth(monthKeys[0]);
  }, [monthKeys, selectedMonth]);

  const currentMonth = selectedMonth ? summary.get(selectedMonth) : undefined;

  const chartData = useMemo(() => {
    if (!currentMonth) return null;
    const labels = Object.keys(currentMonth.types);
    if (!labels.length) return null;
    return {
      labels,
      datasets: [
        {
          data: labels.map((l) => currentMonth.types[l]),
          backgroundColor: labels.map((l, i) => colorMap[l] || DEFAULT_COLORS[i % DEFAULT_COLORS.length]),
          borderWidth: 1,
        },
      ],
    };
  }, [currentMonth, colorMap]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (!expenseType) {
      showToast("يرجى اختيار نوع المصروف.", "warning");
      return;
    }
    if (amt <= 0) {
      showToast("يجب أن يكون مبلغ المصروف أكبر من صفر.", "warning");
      return;
    }
    setSubmitting(true);
    const payload = { expense_type: expenseType, amount: amt, notes: notes || null, occurred_at: new Date().toISOString() };

    if (!navigator.onLine) {
      enqueue("expenses", payload);
      setSubmitting(false);
      showToast("لا يوجد اتصال — تم حفظ المصروف محلياً وسيُرفع تلقائياً عند رجوع النت.", "warning");
      setExpenseType(""); setAmount(""); setNotes("");
      return;
    }

    const { data: inserted, error } = await supabase.from("expenses").insert(payload).select("id").single();
    setSubmitting(false);
    if (error) {
      if (isNetworkError(error)) {
        enqueue("expenses", payload);
        showToast("تعذر الاتصال — تم حفظ المصروف محلياً وسيُرفع تلقائياً عند رجوع النت.", "warning");
        setExpenseType(""); setAmount(""); setNotes("");
        return;
      }
      showToast("خطأ في حفظ المصروف: " + error.message, "error");
      return;
    }

    // المصروف هو مصدر الحقيقة للنقد الخارج؛ قيد الدفتر مرجع للرصيد ومربوط به.
    if (isSalary && workerId && inserted?.id) {
      await addLedgerEntry({
        worker_id: workerId,
        kind: "payment",
        amount: amt,
        payment_source: paymentSource,
        expense_id: inserted.id,
        notes: notes || null,
      });
    }

    showToast("تم حفظ المصروف بنجاح.");
    setExpenseType("");
    setAmount("");
    setNotes("");
    setWorkerId("");
    loadExpenses();
  }

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد من حذف هذا المصروف؟")) return;
    const { error } = await supabase.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      showToast("فشل الحذف: " + error.message, "error");
      return;
    }
    showToast("تم حذف المصروف بنجاح.");
    loadExpenses();
  }

  async function handleUpdate(expense: Expense, patch: { expense_type: string; amount: number; notes: string }) {
    if (patch.amount <= 0) {
      showToast("يجب أن يكون مبلغ المصروف أكبر من صفر.", "warning");
      return;
    }
    const { error } = await supabase
      .from("expenses")
      .update({ expense_type: patch.expense_type, amount: patch.amount, notes: patch.notes || null })
      .eq("id", expense.id);
    if (error) {
      showToast("فشل التحديث: " + error.message, "error");
      return;
    }
    showToast("تم تحديث المصروف بنجاح.");
    setEditingId(null);
    loadExpenses();
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="section-title">إضافة مصروف جديد</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="form-label">نوع المصروف</label>
            <div className="select-wrapper">
              <select value={expenseType} onChange={(e) => setExpenseType(e.target.value)} required>
                <option value="">اختر...</option>
                {expenseTypes.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">المبلغ (ر.س)</label>
            <input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          {isSalary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">العامل (اختياري — يقيّد بدفتر حسابه)</label>
                <div className="select-wrapper">
                  <select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
                    <option value="">بدون ربط</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">مصدر الدفع</label>
                <div className="select-wrapper">
                  <select value={paymentSource} onChange={(e) => setPaymentSource(e.target.value)}>
                    {PAYMENT_SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="form-label">ملاحظات</label>
            <input type="text" placeholder="اختياري..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="submit" disabled={submitting} className="btn-add-expense w-full">
            {submitting ? <span className="spinner" /> : "حفظ المصروف"}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-5">
          <div>
            <h2 className="section-title mb-1">ملخص المصروفات</h2>
            <p className="txt-muted">اختر الشهر لعرض الملخص والتوزيع.</p>
          </div>
          <div className="w-full md:w-72">
            <label className="form-label">الشهر</label>
            <div className="select-wrapper">
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                {monthKeys.map((key) => (
                  <option key={key} value={key}>{summary.get(key)!.monthName}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <MetricCard label="إجمالي المصروفات" value={formatCurrency(currentMonth?.total || 0)} tone="red" />
          <MetricCard label="عدد العمليات" value={currentMonth?.entries.length || 0} tone="indigo" />
          <MetricCard
            label="متوسط المصروف"
            value={formatCurrency(currentMonth && currentMonth.entries.length ? currentMonth.total / currentMonth.entries.length : 0)}
            tone="amber"
          />
        </div>

        <div className="chart-box">
          {chartData && <Doughnut data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }} />}
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <button type="button" className={`accordion-button ${showEntries ? "active" : ""}`} onClick={() => setShowEntries((v) => !v)}>
          <span>سجل المصروفات</span>
          <span>⌄</span>
        </button>
        <div className="accordion-content" style={{ maxHeight: showEntries ? "5000px" : undefined }}>
          <div className="p-4 overflow-x-auto">
            {expenses.length === 0 ? (
              <p className="text-center txt-muted py-5">لا توجد سجلات مصروفات.</p>
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>التاريخ</th><th>نوع المصروف</th><th>المبلغ</th><th>ملاحظات</th><th>إجراءات</th></tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <ExpenseRow
                      key={exp.id}
                      expense={exp}
                      expenseTypes={expenseTypes.map((t) => t.name)}
                      editing={editingId === exp.id}
                      onEdit={() => setEditingId(exp.id)}
                      onCancel={() => setEditingId(null)}
                      onSave={(patch) => handleUpdate(exp, patch)}
                      onDelete={() => handleDelete(exp.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ExpenseRow({
  expense,
  expenseTypes,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  expense: Expense;
  expenseTypes: string[];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: { expense_type: string; amount: number; notes: string }) => void;
  onDelete: () => void;
}) {
  const [type, setType] = useState(expense.expense_type);
  const [amount, setAmount] = useState(String(expense.amount));
  const [notes, setNotes] = useState(expense.notes || "");

  if (!editing) {
    return (
      <tr>
        <td data-label="التاريخ">{new Date(expense.occurred_at).toLocaleDateString("en-GB")}</td>
        <td data-label="نوع المصروف">{expense.expense_type}</td>
        <td data-label="المبلغ" className="txt-expense">{formatCurrency(expense.amount)}</td>
        <td data-label="ملاحظات">{expense.notes || ""}</td>
        <td className="flex gap-1.5">
          <button type="button" className="action-button edit-button" onClick={onEdit}>تعديل</button>
          <button type="button" className="action-button delete-button" onClick={onDelete}>حذف</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={5}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-2">
          <div>
            <label className="form-label">نوع المصروف</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {expenseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">المبلغ</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="form-label">ملاحظات</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pb-2">
          <button type="button" className="btn-primary" onClick={() => onSave({ expense_type: type, amount: Number(amount) || 0, notes })}>حفظ</button>
          <button type="button" className="btn-secondary" onClick={onCancel}>إلغاء</button>
        </div>
      </td>
    </tr>
  );
}
