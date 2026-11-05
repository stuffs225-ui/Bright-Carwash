import { describe, it, expect } from "vitest";
import { normalizeSaudiMobile } from "./phone";
describe("Saudi car-wash phone OTP input", () => {
  it("accepts local and international formats", () => {
    for (const value of ["0501234567", "501234567", "+966501234567", "966501234567", "00966501234567", "050 123 4567"]) {
      expect(normalizeSaudiMobile(value)).toBe("+966501234567");
    }
  });
  it("rejects invalid phone values", () => {
    for (const value of ["", "51234567", "0123456789", "+971501234567", "05abc34567"]) {
      expect(normalizeSaudiMobile(value)).toBeNull();
    }
  });
});
