import { describe, expect, it } from "vitest";
import { subtractExisting } from "./importDelta";

describe("import reconciliation", () => {
  const item = (amount: number) => ({amount, time: "2026-10-31T20:00"});
  const key = (r: ReturnType<typeof item>) => `${r.time}:${r.amount}`;
  it("preserves two real identical car washes if destination is empty", () => {
    expect(subtractExisting([item(25),item(25)], [], key, key)).toHaveLength(2);
  });
  it("imports only the second occurrence when one is already recorded", () => {
    expect(subtractExisting([item(25),item(25)], [item(25)], key, key)).toHaveLength(1);
  });
  it("is idempotent when both existing records are already present", () => {
    expect(subtractExisting([item(25),item(25)], [item(25),item(25)], key, key)).toHaveLength(0);
  });
});
