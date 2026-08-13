import { describe, expect, it } from "vitest";
import { computeDiagnostics } from "./diagnostics";
import type { Entry, EntryPreset, Expense } from "./types";

function entry(occurred: string, gross: number, car = "سيارة صغيرة", service = "غسيل كامل"): Entry {
  return {
    id: Math.random().toString(),
    car_type: car,
    service_type: service,
    cash_paid: gross,
    card_paid: 0,
    gross,
    payment_method: "كاش",
    notes: null,
    occurred_at: occurred,
    worker_name: null,
  };
}

function expense(occurred: string, amount: number): Expense {
  return { id: Math.random().toString(), expense_type: "راتب", amount, notes: null, occurred_at: occurred };
}

const presets: EntryPreset[] = [
  { id: "p1", car_type: "سيارة صغيرة", service_type: "غسيل كامل", amount: 25, sort_order: 1 },
];

describe("computeDiagnostics", () => {
  it("flags a day that has expenses but no cars", () => {
    const d = computeDiagnostics(
      [entry("2026-08-01T20:00:00+03:00", 25)],
      [expense("2026-08-02T12:00:00+03:00", 300)],
      presets,
      "2026-08-01",
      "2026-08-02"
    );
    expect(d.expenseWithoutIncome.map((x) => x.date)).toEqual(["2026-08-02"]);
    expect(d.incomeWithoutExpense.map((x) => x.date)).toEqual(["2026-08-01"]);
  });

  it("lists days inside the range with no records at all", () => {
    const d = computeDiagnostics(
      [entry("2026-08-01T20:00:00+03:00", 25)],
      [],
      presets,
      "2026-08-01",
      "2026-08-04"
    );
    expect(d.silentDays).toEqual(["2026-08-02", "2026-08-03", "2026-08-04"]);
  });

  it("catches prices far from the preset for that combination", () => {
    const d = computeDiagnostics(
      [
        entry("2026-08-01T20:00:00+03:00", 25), // normal
        entry("2026-08-01T21:00:00+03:00", 130), // the real 130 SAR outlier from history
        entry("2026-08-01T22:00:00+03:00", 1), // and the 1 SAR one
        entry("2026-08-01T23:00:00+03:00", 30), // within tolerance of 25
      ],
      [],
      presets,
      "2026-08-01",
      "2026-08-01"
    );
    expect(d.priceOutliers.map((o) => o.amount)).toEqual([130, 1]);
    expect(d.priceOutliers[0].usual).toBe(25);
  });

  it("does not flag a combination that has no reference price", () => {
    const d = computeDiagnostics(
      [entry("2026-08-01T20:00:00+03:00", 999, "دبابة", "تلميع")],
      [],
      presets,
      "2026-08-01",
      "2026-08-01"
    );
    // منوال حالته الوحيدة هو نفسه، فلا يُعد شاذاً
    expect(d.priceOutliers).toEqual([]);
  });

  it("detects batch entry — three or more in the same minute", () => {
    const d = computeDiagnostics(
      [
        entry("2026-08-01T23:30:00+03:00", 25),
        entry("2026-08-01T23:30:20+03:00", 25),
        entry("2026-08-01T23:30:40+03:00", 25),
        entry("2026-08-01T21:00:00+03:00", 25),
      ],
      [],
      presets,
      "2026-08-01",
      "2026-08-01"
    );
    expect(d.batches).toHaveLength(1);
    expect(d.batches[0].count).toBe(3);
  });

  it("totals reflect every record passed in", () => {
    const d = computeDiagnostics(
      [entry("2026-08-01T20:00:00+03:00", 25), entry("2026-08-02T20:00:00+03:00", 30)],
      [expense("2026-08-01T12:00:00+03:00", 100)],
      presets,
      "2026-08-01",
      "2026-08-02"
    );
    expect(d.totals).toEqual({ days: 2, cars: 2, revenue: 55, expenses: 100 });
  });
});
