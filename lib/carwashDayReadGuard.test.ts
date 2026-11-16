import {describe,it,expect} from "vitest";
import {isCurrentDayRead} from "./carwashDayReadGuard";
describe("settlement async read version guard",()=>{
 it("allows only the latest response for the currently selected date",()=>{
  expect(isCurrentDayRead("2026-11-16",5,"2026-11-16",5)).toBe(true);
  expect(isCurrentDayRead("2026-11-15",4,"2026-11-16",5)).toBe(false);
  expect(isCurrentDayRead("2026-11-16",4,"2026-11-16",5)).toBe(false);
 });
 it("discards old records immediately after an approved day is closed",()=>{
  expect(isCurrentDayRead("2026-11-16",5,"",6)).toBe(false);
 });
 it("never accepts an empty or ambiguous selected date",()=>{
  expect(isCurrentDayRead("",1,"",1)).toBe(false);
 });
});
