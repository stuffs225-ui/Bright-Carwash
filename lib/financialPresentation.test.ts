import {describe,expect,it} from "vitest";
import {netProfitMarginPercent,operatingResult,displayPercent,displaySar} from "./financialPresentation";
describe("Carwash honest financial presentation",()=>{
 it("treats recorded shortfall as a loss with its magnitude",()=>{
  expect(operatingResult(1760,3941)).toEqual({amount:2181,status:"loss",label:"خسارة"});
 });
 it("shows positive results and break-even without sign tricks",()=>{
  expect(operatingResult(200,100)).toEqual({amount:100,status:"profit",label:"ربح"});
  expect(operatingResult(100,100)).toEqual({amount:0,status:"even",label:"تعادل"});
 });
 it("displays the correct ratio and excludes undefined ratios",()=>{
  expect(netProfitMarginPercent(1760,3941)).toBeCloseTo(-123.92045,3);
  expect(netProfitMarginPercent(200,0)).toBe(100);
  expect(netProfitMarginPercent(0,100)).toBeNull();
  expect(netProfitMarginPercent(200,100)).toBe(50);
  expect(displayPercent(null)).toBe("غير متاح");
  expect(displayPercent(-55.3)).toBe("−55.3%");
 });
 it("uses readable Arabic Saudi Riyal formatting",()=>{
  expect(displaySar(-2181)).toContain("2,181");
  expect(displaySar(1760)).toContain("ر.س");
 });
});