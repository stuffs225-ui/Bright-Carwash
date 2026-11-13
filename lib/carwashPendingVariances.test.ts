import {describe,expect,it} from "vitest";
import {pendingNetworkDifference} from "./carwashPendingVariances";

describe("pending worker report network variance",()=>{
 it("does not flag matching totals",()=>{
  expect(pendingNetworkDifference("150.00",150)).toBe(0);
 });
 it("flags unrecorded positive and negative gaps before settlement",()=>{
  expect(pendingNetworkDifference(110.5,"100.00")).toBe(10.5);
  expect(pendingNetworkDifference(95,"100.00")).toBe(-5);
 });
 it("avoids misleading variance on missing or corrupt totals",()=>{
  expect(pendingNetworkDifference(undefined,80)).toBe(0);
  expect(pendingNetworkDifference("bad",80)).toBe(0);
 });
});
