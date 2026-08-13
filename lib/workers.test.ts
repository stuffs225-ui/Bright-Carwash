import { describe, expect, it } from "vitest";
import { balanceOf, balancesByWorker } from "./workers";
import type { LedgerEntry, Worker } from "./types";

function led(worker_id: string, kind: "earning" | "payment", amount: number): LedgerEntry {
  return {
    id: Math.random().toString(),
    worker_id,
    kind,
    amount,
    occurred_at: "2026-08-01T12:00:00+03:00",
    payment_source: kind === "payment" ? "cash" : null,
    expense_id: null,
    notes: null,
  };
}

const hussain: Worker = { id: "w1", name: "حسين", active: true, sort_order: 1, notes: null };
const omar: Worker = { id: "w2", name: "محمد عمر", active: true, sort_order: 2, notes: null };

describe("balanceOf", () => {
  it("is earnings minus payments", () => {
    expect(balanceOf([led("w1", "earning", 1200), led("w1", "payment", 500)])).toBe(700);
  });

  it("goes negative when a worker is paid more than earned so far", () => {
    // يحصل فعلياً: سلفة قبل تسجيل المستحق
    expect(balanceOf([led("w1", "payment", 300)])).toBe(-300);
  });

  it("is zero for an empty ledger", () => {
    expect(balanceOf([])).toBe(0);
  });
});

describe("balancesByWorker", () => {
  it("keeps each worker's rows separate", () => {
    const ledger = [
      led("w1", "earning", 1000),
      led("w1", "payment", 400),
      led("w2", "earning", 800),
    ];
    const result = balancesByWorker([hussain, omar], ledger);

    expect(result[0]).toMatchObject({ earned: 1000, paid: 400, balance: 600, entries: 2 });
    expect(result[1]).toMatchObject({ earned: 800, paid: 0, balance: 800, entries: 1 });
  });

  it("includes a worker with no ledger rows at all", () => {
    const result = balancesByWorker([hussain], []);
    expect(result[0]).toMatchObject({ earned: 0, paid: 0, balance: 0, entries: 0 });
  });
});
