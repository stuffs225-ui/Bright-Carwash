import { describe, expect, it } from "vitest";
import { getOperationalShiftBounds, bonusPerWorker } from "./business";
describe("Saudi carwash shift", () => {
  it("counts after-midnight work toward previous 15:00 shift", () => {
    const b = getOperationalShiftBounds(new Date("2026-11-01T00:30:00Z"));
    expect(b.start.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-11-01T01:00:00.000Z");
  });
  it("returns previous completed shift before the new shift opens", () => {
    const b = getOperationalShiftBounds(new Date("2026-11-01T08:00:00Z"));
    expect(b.start.toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });
  it("preserves original bonus threshold and rate", () => {
    expect(bonusPerWorker(15, 15, 2)).toBe(0);
    expect(bonusPerWorker(18, 15, 2)).toBe(6);
  });
});
