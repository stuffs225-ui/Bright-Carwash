import {describe,it,expect} from "vitest";
import {riyadhDayKey} from "./carwashCalendarDay";
describe("financial date grouping follows Riyadh, never browser timezone",()=>{
 it("late UTC evening is a new Riyadh accounting date",()=>{
  expect(riyadhDayKey("2026-11-06T22:30:00.000Z")).toBe("2026-11-07");
 });
 it("Riyadh midnight and previous day never merge",()=>{
  expect(riyadhDayKey("2026-11-06T20:59:59.999Z")).toBe("2026-11-06");
  expect(riyadhDayKey("2026-11-06T21:00:00.000Z")).toBe("2026-11-07");
 });
});
