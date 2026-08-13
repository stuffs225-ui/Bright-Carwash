import { describe, expect, it } from "vitest";
import { bonusPerWorker, getCurrentShiftWindow, getPaymentMethod } from "./business";

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

describe("getCurrentShiftWindow", () => {
  it("before the start hour belongs to yesterday's shift", () => {
    const now = new Date(2026, 0, 15, 10, 0, 0); // 10am, before 3pm start
    const { start, end } = getCurrentShiftWindow(now, 15, 4);
    expect(start).toEqual(new Date(2026, 0, 14, 15, 0, 0));
    expect(end).toEqual(new Date(2026, 0, 15, 4, 0, 0));
  });

  it("after the start hour belongs to today's shift", () => {
    const now = new Date(2026, 0, 15, 20, 0, 0); // 8pm, after 3pm start
    const { start, end } = getCurrentShiftWindow(now, 15, 4);
    expect(start).toEqual(new Date(2026, 0, 15, 15, 0, 0));
    expect(end).toEqual(new Date(2026, 0, 16, 4, 0, 0));
  });

  it("exactly at the start hour belongs to today's shift", () => {
    const now = new Date(2026, 0, 15, 15, 0, 0);
    const { start } = getCurrentShiftWindow(now, 15, 4);
    expect(start).toEqual(new Date(2026, 0, 15, 15, 0, 0));
  });
});
