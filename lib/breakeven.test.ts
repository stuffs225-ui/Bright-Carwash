import { describe, expect, it } from "vitest";
import { computeBreakEven } from "./breakeven";

describe("computeBreakEven", () => {
  // القيم من البيانات الفعلية: ~7987 ريال مصروف شهري، متوسط فاتورة 24.99
  it("matches the real historical figures (~10.7 cars/day)", () => {
    const r = computeBreakEven({
      windowExpenses: 7987 * 3,
      windowRevenue: 24.99 * 960,
      windowEntries: 960,
      windowDays: 90,
    });
    expect(r.avgTicket).toBeCloseTo(24.99, 2);
    expect(r.dailyExpense).toBeCloseTo(266.23, 1);
    expect(r.carsNeeded).toBe(11); // ceil(10.65)
  });

  it("rounds up — a partial car still has to be washed", () => {
    const r = computeBreakEven({
      windowExpenses: 1000,
      windowRevenue: 2500,
      windowEntries: 100,
      windowDays: 100,
    });
    expect(r.avgTicket).toBe(25);
    expect(r.dailyExpense).toBe(10);
    expect(r.carsNeeded).toBe(1); // 10/25 = 0.4 -> 1
  });

  it("manual target overrides the computed daily expense", () => {
    const r = computeBreakEven({
      windowExpenses: 9000,
      windowRevenue: 2500,
      windowEntries: 100,
      windowDays: 90,
      manualDailyTarget: 500,
    });
    expect(r.dailyExpense).toBe(500);
    expect(r.carsNeeded).toBe(20); // 500/25
  });

  it("returns zero cars when there is no ticket history to divide by", () => {
    const r = computeBreakEven({
      windowExpenses: 9000,
      windowRevenue: 0,
      windowEntries: 0,
      windowDays: 90,
    });
    expect(r.avgTicket).toBe(0);
    expect(r.carsNeeded).toBe(0);
  });

  it("handles a period with no expenses recorded", () => {
    const r = computeBreakEven({
      windowExpenses: 0,
      windowRevenue: 2500,
      windowEntries: 100,
      windowDays: 90,
    });
    expect(r.dailyExpense).toBe(0);
    expect(r.carsNeeded).toBe(0);
  });

  it("does not divide by a zero-length window", () => {
    const r = computeBreakEven({
      windowExpenses: 500,
      windowRevenue: 2500,
      windowEntries: 100,
      windowDays: 0,
    });
    expect(r.dailyExpense).toBe(0);
    expect(r.carsNeeded).toBe(0);
  });
});
