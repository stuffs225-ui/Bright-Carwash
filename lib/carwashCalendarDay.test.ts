import {describe,it,expect} from "vitest";
import {calendarDayTotals,crewBonusEligible,dayIsFinished,riyadhDayKey,visibleWorkerCalendarEntries} from "./carwashCalendarDay";
describe("Midnight Riyadh business dates (not old 15:00-04:00 shift)",()=>{
 it("accrues 10 SAR for a truck along with cars, but not unknown vehicle classes",()=>{
  expect(crewBonusEligible("سيارة صغيرة")).toBe(true);
  expect(crewBonusEligible("سيارة كبيرة")).toBe(true);
  expect(crewBonusEligible("شاحنة")).toBe(true);
  expect(crewBonusEligible("دراجة")).toBe(false);
  expect(calendarDayTotals([{car_type:"شاحنة",cash_paid:0,card_paid:50}]).collectiveTens).toBe(10);
 });
 it("classifies 23:59:59 and 00:00:00 exactly",()=>{
  expect(riyadhDayKey("2026-11-05T20:59:59.000Z")).toBe("2026-11-05");
  expect(riyadhDayKey("2026-11-05T21:00:00.000Z")).toBe("2026-11-06");
 });
 it("marks the calendar day finished only at the new local midnight",()=>{
  expect(dayIsFinished("2026-11-05",new Date("2026-11-05T20:59:59Z"))).toBe(false);
  expect(dayIsFinished("2026-11-05",new Date("2026-11-05T21:00:00Z"))).toBe(true);
 });
 it("shows two or more unapproved days but hides only manager-approved date",()=>{
  const entries=[
    {id:"1",business_date:"2026-11-04",occurred_at:"2026-11-04T12:00:00Z",cash_paid:25,card_paid:0},
    {id:"2",car_type:"سيارة كبيرة",business_date:"2026-11-05",occurred_at:"2026-11-05T12:00:00Z",cash_paid:0,card_paid:30},
    {id:"3",car_type:"سيارة صغيرة",business_date:"2026-11-06",occurred_at:"2026-11-06T12:00:00Z",cash_paid:10,card_paid:10}
  ];
  const days=[
    {business_date:"2026-11-04",status:"approved" as const},
    {business_date:"2026-11-05",status:"open" as const},
    {business_date:"2026-11-06",status:"open" as const}
  ];
  expect(visibleWorkerCalendarEntries(entries,days).map(e=>e.id)).toEqual(["2","3"]);
  expect(calendarDayTotals(visibleWorkerCalendarEntries(entries,days)).collectiveTens).toBe(20);
 });
});
