import { supabase } from "./supabaseClient";
import type { LedgerEntry, Worker, WorkerBalance } from "./types";

export async function loadWorkers(): Promise<Worker[]> {
  const { data } = await supabase.from("workers").select("*").order("sort_order");
  return (data as Worker[]) || [];
}

export async function loadLedger(workerId?: string): Promise<LedgerEntry[]> {
  let q = supabase.from("worker_ledger").select("*").is("deleted_at", null);
  if (workerId) q = q.eq("worker_id", workerId);
  const { data } = await q.order("occurred_at", { ascending: false });
  return (data as LedgerEntry[]) || [];
}

/**
 * الرصيد = المستحق − المدفوع. موجب يعني الشغل له عند المحل.
 * يُحسب هنا بدل تخزينه، فلا يمكن أن يتعارض عمود مخزَّن مع القيود.
 */
export function balanceOf(ledger: LedgerEntry[]): number {
  return ledger.reduce(
    (sum, l) => sum + (l.kind === "earning" ? Number(l.amount) : -Number(l.amount)),
    0
  );
}

export function balancesByWorker(workers: Worker[], ledger: LedgerEntry[]): WorkerBalance[] {
  return workers.map((w) => {
    const rows = ledger.filter((l) => l.worker_id === w.id);
    const earned = rows.filter((r) => r.kind === "earning").reduce((s, r) => s + Number(r.amount), 0);
    const paid = rows.filter((r) => r.kind === "payment").reduce((s, r) => s + Number(r.amount), 0);
    return { worker: w, earned, paid, balance: earned - paid, entries: rows.length };
  });
}

export async function addWorker(name: string, sortOrder: number) {
  return supabase.from("workers").insert({ name: name.trim(), sort_order: sortOrder });
}

export async function addLedgerEntry(entry: {
  worker_id: string;
  kind: "earning" | "payment";
  amount: number;
  payment_source?: string | null;
  notes?: string | null;
  expense_id?: string | null;
}) {
  return supabase.from("worker_ledger").insert({
    ...entry,
    occurred_at: new Date().toISOString(),
  });
}

export async function softDeleteLedgerEntry(id: string) {
  return supabase.from("worker_ledger").update({ deleted_at: new Date().toISOString() }).eq("id", id);
}

export const PAYMENT_SOURCES: { value: string; label: string }[] = [
  { value: "cash", label: "كاش" },
  { value: "atm", label: "صراف" },
  { value: "network", label: "شبكة" },
  { value: "other", label: "أخرى" },
];
