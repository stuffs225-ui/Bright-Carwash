"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AR_GREGORIAN_LOCALE, formatCurrency, toDateKey } from "@/lib/business";
import { showToast } from "@/lib/toast";
import {
  PAYMENT_SOURCES,
  addLedgerEntry,
  addWorker,
  balancesByWorker,
  loadLedger,
  loadWorkers,
  softDeleteLedgerEntry,
} from "@/lib/workers";
import type { LedgerEntry, Worker } from "@/lib/types";
import { MetricCard } from "./MetricCard";
import { Modal } from "./Modal";

export function WorkersTab() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [openWorker, setOpenWorker] = useState<Worker | null>(null);
  const [newName, setNewName] = useState("");

  const reload = useCallback(async () => {
    const [w, l] = await Promise.all([loadWorkers(), loadLedger()]);
    setWorkers(w);
    setLedger(l);
  }, []);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel("workers-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_ledger" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "workers" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const balances = useMemo(() => balancesByWorker(workers, ledger), [workers, ledger]);

  const totals = useMemo(
    () => ({
      owed: balances.reduce((s, b) => s + Math.max(0, b.balance), 0),
      advanced: balances.reduce((s, b) => s + Math.max(0, -b.balance), 0),
      paid: balances.reduce((s, b) => s + b.paid, 0),
    }),
    [balances]
  );

  async function handleAddWorker() {
    if (!newName.trim()) return;
    await addWorker(newName, workers.length + 1);
    setNewName("");
    showToast("تمت إضافة العامل.");
    reload();
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="مستحق للعمال" value={formatCurrency(totals.owed)} tone="amber" />
        <MetricCard label="سلف على العمال" value={formatCurrency(totals.advanced)} tone="purple" />
        <MetricCard label="إجمالي المدفوع" value={formatCurrency(totals.paid)} tone="emerald" />
      </section>

      <section className="card">
        <h2 className="section-title mb-1">دفتر حساب العمال</h2>
        <p className="txt-muted text-sm mb-4">
          الرصيد = المستحق − المدفوع. الرقم الموجب يعني له عندك، والسالب يعني أخذ سلفة.
          اضغط على أي عامل لفتح كشف حسابه.
        </p>

        <div className="overflow-x-auto">
          <table className="app-table">
            <thead>
              <tr><th>العامل</th><th>المستحق</th><th>المدفوع</th><th>الرصيد</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {balances.length === 0 ? (
                <tr><td colSpan={5} className="text-center txt-muted py-5">لا يوجد عمال مسجّلون.</td></tr>
              ) : (
                balances.map((b) => (
                  <tr key={b.worker.id}>
                    <td data-label="العامل">
                      <button type="button" className="link-inline" onClick={() => setOpenWorker(b.worker)}>
                        {b.worker.name}
                      </button>
                    </td>
                    <td data-label="المستحق">{formatCurrency(b.earned)}</td>
                    <td data-label="المدفوع" className="txt-expense">{formatCurrency(b.paid)}</td>
                    <td data-label="الرصيد" className={`txt-net ${b.balance < 0 ? "is-negative" : ""}`}>
                      {formatCurrency(b.balance)}
                    </td>
                    <td className="flex gap-1.5">
                      <button type="button" className="action-button edit-button" onClick={() => setOpenWorker(b.worker)}>
                        كشف الحساب
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2 items-end mt-5">
          <div className="flex-1" style={{ minWidth: 200 }}>
            <label className="form-label">إضافة عامل جديد</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <button type="button" className="btn-primary" onClick={handleAddWorker}>إضافة</button>
        </div>
      </section>

      {openWorker && (
        <WorkerLedgerModal
          worker={openWorker}
          rows={ledger.filter((l) => l.worker_id === openWorker.id)}
          onClose={() => setOpenWorker(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function WorkerLedgerModal({
  worker,
  rows,
  onClose,
  onChanged,
}: {
  worker: Worker;
  rows: LedgerEntry[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<"earning" | "payment">("earning");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      showToast("أدخل مبلغاً أكبر من صفر.", "warning");
      return;
    }
    setSaving(true);
    await addLedgerEntry({
      worker_id: worker.id,
      kind,
      amount: amt,
      payment_source: kind === "payment" ? source : null,
      notes: notes || null,
    });
    setSaving(false);
    setAmount("");
    setNotes("");
    showToast(kind === "earning" ? "تم تسجيل المستحق." : "تم تسجيل الدفعة.");
    onChanged();
  }

  async function remove(id: string) {
    if (!confirm("حذف هذا القيد؟")) return;
    await softDeleteLedgerEntry(id);
    showToast("تم الحذف.");
    onChanged();
  }

  return (
    <Modal title={`كشف حساب — ${worker.name}`} onClose={onClose}>
      <div className="card mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="form-label">نوع القيد</label>
            <div className="select-wrapper">
              <select value={kind} onChange={(e) => setKind(e.target.value as "earning" | "payment")}>
                <option value="earning">مستحق له</option>
                <option value="payment">دفعة له</option>
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">المبلغ</label>
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {kind === "payment" && (
            <div>
              <label className="form-label">مصدر الدفع</label>
              <div className="select-wrapper">
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  {PAYMENT_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="form-label">ملاحظات</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn-primary mt-4" onClick={add} disabled={saving}>
          {saving ? <span className="spinner" /> : "إضافة القيد"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="app-table">
          <thead>
            <tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>المصدر</th><th>ملاحظات</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center txt-muted py-5">لا توجد قيود.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="التاريخ">
                    {new Date(r.occurred_at).toLocaleDateString(AR_GREGORIAN_LOCALE, {
                      year: "numeric", month: "short", day: "numeric",
                    })}
                  </td>
                  <td data-label="النوع">{r.kind === "earning" ? "مستحق" : "دفعة"}</td>
                  <td data-label="المبلغ" className={r.kind === "earning" ? "txt-cash" : "txt-expense"}>
                    {formatCurrency(r.amount)}
                  </td>
                  <td data-label="المصدر">
                    {PAYMENT_SOURCES.find((s) => s.value === r.payment_source)?.label || "—"}
                  </td>
                  <td data-label="ملاحظات">{r.notes || ""}</td>
                  <td className="flex gap-1.5">
                    <button type="button" className="action-button delete-button" onClick={() => remove(r.id)}>حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
