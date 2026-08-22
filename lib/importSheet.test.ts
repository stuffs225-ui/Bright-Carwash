import { describe, expect, it } from "vitest";
import { entryKey, expenseKey } from "./importSheet";

describe("entryKey", () => {
  it("matches the same transaction regardless of cash/card split source", () => {
    const a = { occurred_at: "2026-01-05T14:30:00+03:00", car_type: "سيارة صغيرة", service_type: "غسيل كامل", cash_paid: 25, card_paid: 0 };
    const b = { occurred_at: "2026-01-05T14:30:00+03:00", car_type: "سيارة صغيرة", service_type: "غسيل كامل", cash_paid: 25, card_paid: 0 };
    expect(entryKey(a)).toBe(entryKey(b));
  });

  it("ignores seconds within the same minute", () => {
    const a = { occurred_at: "2026-01-05T14:30:00+03:00", car_type: "سيارة صغيرة", service_type: "غسيل كامل", cash_paid: 25, card_paid: 0 };
    const b = { occurred_at: "2026-01-05T14:30:45+03:00", car_type: "سيارة صغيرة", service_type: "غسيل كامل", cash_paid: 25, card_paid: 0 };
    expect(entryKey(a)).toBe(entryKey(b));
  });

  it("differs when the total amount differs", () => {
    const a = { occurred_at: "2026-01-05T14:30:00+03:00", car_type: "سيارة صغيرة", service_type: "غسيل كامل", cash_paid: 25, card_paid: 0 };
    const b = { occurred_at: "2026-01-05T14:30:00+03:00", car_type: "سيارة صغيرة", service_type: "غسيل كامل", cash_paid: 30, card_paid: 0 };
    expect(entryKey(a)).not.toBe(entryKey(b));
  });

  it("differs across different minutes", () => {
    const a = { occurred_at: "2026-01-05T14:30:00+03:00", car_type: "سيارة صغيرة", service_type: "غسيل كامل", cash_paid: 25, card_paid: 0 };
    const b = { occurred_at: "2026-01-05T14:31:00+03:00", car_type: "سيارة صغيرة", service_type: "غسيل كامل", cash_paid: 25, card_paid: 0 };
    expect(entryKey(a)).not.toBe(entryKey(b));
  });
});

describe("expenseKey", () => {
  it("matches identical expenses", () => {
    const a = { occurred_at: "2026-01-05T09:00:00+03:00", expense_type: "راتب", amount: 1500 };
    const b = { occurred_at: "2026-01-05T09:00:00+03:00", expense_type: "راتب", amount: 1500 };
    expect(expenseKey(a)).toBe(expenseKey(b));
  });

  it("differs across different expense types", () => {
    const a = { occurred_at: "2026-01-05T09:00:00+03:00", expense_type: "راتب", amount: 1500 };
    const b = { occurred_at: "2026-01-05T09:00:00+03:00", expense_type: "ايجار", amount: 1500 };
    expect(expenseKey(a)).not.toBe(expenseKey(b));
  });
});
