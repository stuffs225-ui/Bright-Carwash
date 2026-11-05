import { describe, expect, it } from "vitest";
import {provisionalCrewEntitlement,shiftBonusAmount,crewProvisionForCarCount} from "./carwashCompensation";
describe("Owner-approved wash vehicle labor rates",()=>{
  it("books a crew pool of SAR 10 per small and per large car",()=>{
    expect(provisionalCrewEntitlement([{size:"small",quantity:3},{size:"large",quantity:2}])).toBe(50);
  });
  it("counts the SAR10 rate once per registered car, not per employee",()=>{
    expect(crewProvisionForCarCount(7)).toBe(70);
    expect(()=>crewProvisionForCarCount(-1)).toThrow();
  });
  it("does not imply a per-person distribution",()=>{
    expect(provisionalCrewEntitlement([])).toBe(0);
    expect(()=>provisionalCrewEntitlement([{size:"small",quantity:-1}])).toThrow();
  });
  it("allows a distinct manager bonus",()=>{
    expect(shiftBonusAmount(40)).toBe(40);
    expect(()=>shiftBonusAmount(-5)).toThrow();
  });
});
