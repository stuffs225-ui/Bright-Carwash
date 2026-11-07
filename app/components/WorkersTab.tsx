"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AR_GREGORIAN_LOCALE, formatCurrency, toDateKey } from "@/lib/business";
import { showToast } from "@/lib/toast";
import {
  PAYMENT_SOURCES,
  addLedgerEntry,
  addWorker,
  editWorker,
  balancesByWorker,
  loadLedger,
  loadWorkers,
  softDeleteLedgerEntry,
} from "@/lib/workers";
import type { LedgerEntry, Worker } from "@/lib/types";
import { MetricCard } from "./MetricCard";
import { Modal } from "./Modal";

export function WorkersTab({view="workers"}:{view?:"workers"|"dues"|"payments"|"statements"}) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [openWorker, setOpenWorker] = useState<Worker | null>(null);
  const [workerMetric, setWorkerMetric] = useState<"owed"|"advanced"|"paid"|null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"worker"|"team">("worker");
  const [newHourlyRate, setNewHourlyRate] = useState("0");

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
    const rate = Number(newHourlyRate);
    if (!Number.isFinite(rate) || rate < 0) {
      showToast("الأجر بالساعة يجب أن يكون صفرًا أو أكبر.", "warning");
      return;
    }
    const {error} = await addWorker(newName, workers.length + 1, newType, rate);
    if (error) { showToast(error.message, "error"); return; }
    setNewName("");
    setNewHourlyRate("0");
    showToast("تمت إضافة العامل أو الفريق.");
    await reload();
  }

  return (
    <div className="space-y-6">
      {view!=="workers"&&<section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="مستحق للعمال" value={formatCurrency(totals.owed)} tone="amber" onClick={()=>setWorkerMetric("owed")} hint="كشف حساب أرصدة العمال الدائنة" />
        <MetricCard label="سلف على العمال" value={formatCurrency(totals.advanced)} tone="purple" onClick={()=>setWorkerMetric("advanced")} hint="تفاصيل سلف العمال" />
        <MetricCard label="إجمالي المدفوع" value={formatCurrency(totals.paid)} tone="emerald" onClick={()=>setWorkerMetric("paid")} hint="تفاصيل مبالغ دفعت للعمال" />
      </section>}

      {workerMetric && (
        <Modal title={workerMetric==="owed"?"تفاصيل المستحقات":workerMetric==="advanced"?"تفاصيل سلف العمال":"تفاصيل مدفوعات العمال"} onClose={()=>setWorkerMetric(null)}>
          <p className="font-bold mb-3">{formatCurrency(totals[workerMetric])}</p>
          <div className="space-y-2">
            {balances.filter(b=>workerMetric==="owed"?b.balance>0:workerMetric==="advanced"?b.balance<0:b.paid>0)
              .map(b=>(
                <button type="button" key={b.worker.id} className="w-full text-start flex justify-between gap-2 border-b py-3 link-inline"
                  onClick={()=>{setWorkerMetric(null);setOpenWorker(b.worker);}}>
                  <span>{b.worker.name} · كشف حساب</span>
                  <strong>{formatCurrency(workerMetric==="owed"?b.balance:workerMetric==="advanced"?-b.balance:b.paid)}</strong>
                </button>
              ))}
          </div>
        </Modal>
      )}

      <section className="card">
        <h2 className="section-title mb-1">{view==="workers"?"إدارة العمال":view==="dues"?"المستحقات والرواتب":view==="payments"?"الدفعات والسلف":"كشوف حساب العمال"}</h2>
        <p className="txt-muted text-sm mb-4">
          الرصيد = المستحق − المدفوع. الرقم الموجب يعني له عندك، والسالب يعني أخذ سلفة.
          اضغط على أي عامل لفتح كشف حسابه.
        </p>

        <div className="overflow-x-auto">
          <table className="app-table">
            <thead>
              <tr><th>العامل / الفريق</th><th>النوع</th><th>الأجر / ساعة</th><th>المستحق</th><th>المدفوع</th><th>الرصيد</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {balances.length === 0 ? (
                <tr><td colSpan={7} className="text-center txt-muted py-5">لا يوجد عمال مسجّلون.</td></tr>
              ) : (
                balances.map((b) => (
                  <tr key={b.worker.id}>
                    <td data-label="العامل">
                      <button type="button" className="link-inline" onClick={() => setOpenWorker(b.worker)}>
                        {b.worker.name}
                      </button>
                    </td>
                    <td data-label="النوع">{b.worker.worker_type === "team" ? "فريق" : "عامل"}</td>
                    <td data-label="الأجر / ساعة">{formatCurrency(b.worker.hourly_rate || 0)}</td>
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

        {view==="workers"&&<div className="flex flex-wrap gap-2 items-end mt-5">
          <div className="flex-1" style={{ minWidth: 200 }}>
            <label className="form-label">إضافة عامل جديد</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">النوع</label>
            <select value={newType} onChange={e=>setNewType(e.target.value as "worker"|"team")}>
              <option value="worker">عامل</option><option value="team">فريق</option>
            </select>
          </div>
          <div>
            <label className="form-label">الأجر بالساعة</label>
            <input type="number" min="0" step="0.01" value={newHourlyRate} onChange={e=>setNewHourlyRate(e.target.value)} />
          </div>
          <button type="button" className="btn-primary" onClick={handleAddWorker}>إضافة</button>
        </div>}
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
  const [workerType, setWorkerType] = useState<"worker"|"team">(worker.worker_type || "worker");
  const [hourlyRate, setHourlyRate] = useState(String(worker.hourly_rate || 0));
  const [saving, setSaving] = useState(false);

  async function add() {
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      showToast("أدخل مبلغاً أكبر من صفر.", "warning");
      return;
    }
    setSaving(true);
    const {error}=await addLedgerEntry({
      worker_id: worker.id,
      kind,
      amount: amt,
      payment_source: kind === "payment" ? source : null,
      notes: notes || null,
    });
    setSaving(false);
    if(error){showToast("لم يُحفظ القيد: "+error.message,"error");return;}
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
        <h3 className="subsection-title mb-2">بيانات العامل / الفريق</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="form-label">النوع
            <select value={workerType} onChange={e=>setWorkerType(e.target.value as "worker"|"team")}>
              <option value="worker">عامل</option><option value="team">فريق</option>
            </select>
          </label>
          <label className="form-label">الأجر بالساعة
            <input type="number" min="0" step="0.01" value={hourlyRate} onChange={e=>setHourlyRate(e.target.value)} />
          </label>
        </div>
        <button type="button" className="btn-secondary mt-3" disabled={saving} onClick={async()=>{
          const rate=Number(hourlyRate);
          if(!Number.isFinite(rate)||rate<0) {showToast("قيمة الأجر غير صالحة", "warning");return;}
          setSaving(true);
          const result=await editWorker(worker.id,{worker_type:workerType,hourly_rate:rate});
          setSaving(false);
          if(result.error) showToast(result.error.message,"error");
          else {showToast("تم حفظ بيانات العامل");onChanged();}
        }}>حفظ بيانات العامل</button>
      </div>
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
