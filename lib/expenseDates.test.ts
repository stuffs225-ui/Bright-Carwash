import { describe, it, expect } from "vitest";
import { riyadhDate, expenseEffectiveTimestamp, lateExpenseMonth } from "./expenseDates";
describe("Carwash historical expenses", () => {
  it("records the effective date in Riyadh", () => {
    expect(expenseEffectiveTimestamp("2026-10-31")).toBe("2026-10-31T09:00:00.000Z");
  });
  it("keeps accounting date independent from UTC date", () => {
    expect(riyadhDate(new Date("2026-10-31T22:00:00Z"))).toBe("2026-11-01");
  });
  it("detects prior month expense", () => {
    expect(lateExpenseMonth("2026-10-31",new Date("2026-11-05T09:00:00Z"))).toBe(true);
    expect(lateExpenseMonth("2026-11-01",new Date("2026-11-05T09:00:00Z"))).toBe(false);
  });
  it("refuses invalid dates", () => {
    expect(()=>expenseEffectiveTimestamp("2026-02-30")).toThrow();
    expect(()=>expenseEffectiveTimestamp("2026-1-01")).toThrow();
  });
});
