import {describe,it,expect} from "vitest";
import {settlementAttentionDays,settlementArchiveMonths,type SettlementDayNav} from "./daySettlementNavigation";

describe("Daily settlement navigation",()=>{
 const days:SettlementDayNav[]=[
  {business_date:"2026-11-14",status:"open"},
  {business_date:"2026-11-13",status:"approved"},
  {business_date:"2026-10-31",status:"approved"},
  {business_date:"2026-11-12",status:"awaiting_owner"},
  {business_date:"2026-11-11",status:"open",reported:true},
  {business_date:"2026-09-30",status:"approved"},
  {business_date:"2026-11-10",status:"open"}
 ];
 it("shows all unfinished days first and prioritizes awaiting approval",()=>{
  expect(settlementAttentionDays(days).map(d=>d.business_date))
   .toEqual(["2026-11-12","2026-11-11","2026-11-14","2026-11-10"]);
  expect(settlementAttentionDays(days).every(d=>d.status!=="approved")).toBe(true);
 });
 it("groups only approved dates by Gregorian month, newest first",()=>{
  const groups=settlementArchiveMonths(days);
  expect(groups.map(m=>m.month)).toEqual(["2026-11","2026-10","2026-09"]);
  expect(groups[0].days.map(d=>d.business_date)).toEqual(["2026-11-13"]);
  expect(groups[0].label).toContain("2026");
  expect(groups[0].label).not.toContain("1448");
 });
 it("keeps all old months available instead of silently cutting off at 90 days",()=>{
  const past=Array.from({length:16},(_,i)=>({
   business_date:`${2025+Math.floor(i/12)}-${String(i%12+1).padStart(2,"0")}-01`,
   status:"approved" as const
  }));
  expect(settlementArchiveMonths(past)).toHaveLength(16);
  expect(settlementArchiveMonths(past).reduce((n,m)=>n+m.days.length,0)).toBe(16);
 });
 it("does not rewrite the input or classify reported open days as approved",()=>{
  const original=JSON.stringify(days);
  settlementAttentionDays(days);
  settlementArchiveMonths(days);
  expect(JSON.stringify(days)).toBe(original);
  expect(settlementArchiveMonths(days).flatMap(m=>m.days).some(d=>d.reported)).toBe(false);
 });
});
