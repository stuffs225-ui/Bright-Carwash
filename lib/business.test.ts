import { describe, expect, it } from "vitest";
import { bonusPerWorker, getDayBounds, getPaymentMethod } from "./business";

describe("getPaymentMethod", () => {
  it("returns كاش when only cash is paid", () => {
    expect(getPaymentMethod(20, 0)).toBe("كاش");
  });
  it("returns بطاقة when only card is paid", () => {
    expect(getPaymentMethod(0, 20)).toBe("بطاقة");
  });
  it("returns مختلط when both are paid", () => {
    expect(getPaymentMethod(10, 10)).toBe("مختلط");
  });
  it("returns غير محدد when nothing is paid", () => {
    expect(getPaymentMethod(0, 0)).toBe("غير محدد");
  });
});

describe("bonusPerWorker", () => {
  it("is zero at or below the threshold", () => {
    expect(bonusPerWorker(15, 15, 2)).toBe(0);
    expect(bonusPerWorker(10, 15, 2)).toBe(0);
  });
  it("pays rate per car above the threshold", () => {
    expect(bonusPerWorker(20, 15, 2)).toBe(10);
  });
  it("uses custom threshold/rate", () => {
    expect(bonusPerWorker(12, 10, 5)).toBe(10);
  });
});

describe("getDayBounds", () => {
  it("spans midnight to midnight regardless of the time of day", () => {
    const { start, end } = getDayBounds(new Date(2026, 0, 15, 23, 59, 59));
    expect(start).toEqual(new Date(2026, 0, 15, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 0, 16, 0, 0, 0));
  });

  it("puts an after-midnight entry on the new day, not the night before", () => {
    // كانت هذي الحالة تُحسب على وردية اليوم السابق بالنظام القديم
    const { start } = getDayBounds(new Date(2026, 0, 15, 2, 30, 0));
    expect(start).toEqual(new Date(2026, 0, 15, 0, 0, 0));
  });

  it("rolls over month boundaries", () => {
    const { start, end } = getDayBounds(new Date(2026, 0, 31, 12, 0, 0));
    expect(start).toEqual(new Date(2026, 0, 31, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 1, 1, 0, 0, 0));
  });

  it("rolls over year boundaries", () => {
    const { end } = getDayBounds(new Date(2026, 11, 31, 12, 0, 0));
    expect(end).toEqual(new Date(2027, 0, 1, 0, 0, 0));
  });
});
