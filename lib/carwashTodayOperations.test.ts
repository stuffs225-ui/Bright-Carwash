import {describe,expect,it} from "vitest";
import {todayOperationsSummary} from "./carwashTodayOperations";
describe("today operations status and finance counters",()=>{
 it("defaults untracked cars to washing",()=>{
  const s=todayOperationsSummary([{id:"1",car_type:"سيارة صغيرة",cash_paid:25,card_paid:0}],new Map());
  expect(s).toEqual({cars:1,counts:{washing:1,ready:0,delivered:0},cash:25,card:0,crew:10});
 });
 it("separates ready and delivered without changing collected amounts",()=>{
  const s=todayOperationsSummary([
   {id:"1",car_type:"سيارة صغيرة",cash_paid:0,card_paid:20.25},
   {id:"2",car_type:"شاحنة",cash_paid:35.75,card_paid:0},
   {id:"3",car_type:"سيارة كبيرة",cash_paid:20,card_paid:10}
  ],new Map([["1","ready" as const],["2","delivered" as const],["3","washing" as const]]));
  expect(s.counts).toEqual({washing:1,ready:1,delivered:1});
  expect(s.cash).toBe(55.75);expect(s.card).toBe(30.25);expect(s.crew).toBe(30);
 });
 it("does not invent income or employee wages on empty days",()=>{
  expect(todayOperationsSummary([],new Map())).toEqual({cars:0,counts:{washing:0,ready:0,delivered:0},cash:0,card:0,crew:0});
 });
});
