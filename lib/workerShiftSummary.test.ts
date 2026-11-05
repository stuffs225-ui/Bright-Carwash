import {describe,it,expect} from "vitest";
import {workerShiftSummary} from "./workerShiftSummary";
const cars = [
 {id:"c1",shift_id:"old",cash_paid:25,card_paid:0},
 {id:"c2",shift_id:"old",cash_paid:0,card_paid:30},
 {id:"c3",shift_id:"new",cash_paid:20,card_paid:5,discount_amount:5},
 {id:"c4",shift_id:"new",cash_paid:15,card_paid:0,pending:true},
];
describe("Carwash shared staff dashboard and immutable shift reset",()=>{
 it("counts SAR10 once per car for whole crew",()=>{
  const x=workerShiftSummary(cars,"old");
  expect(x.cars).toBe(2);expect(x.collectiveTens).toBe(20);
  expect(x.cashCollected).toBe(25);expect(x.cardCollected).toBe(30);
 });
 it("clears old worker dashboard after manager approves old cycle",()=>{
  const x=workerShiftSummary(cars,"new");
  expect(x.cars).toBe(2);expect(x.collectiveTens).toBe(20);
  expect(x.entries.some(e=>e.id==="c1")).toBe(false);
  expect(cars).toHaveLength(4); // history is never deleted
 });
 it("counts pending entries but exposes pending counter",()=>{
  const x=workerShiftSummary(cars,"new");
  expect(x.pending).toBe(1);expect(x.discounts).toBe(5);
 });
 it("without an open cycle, shows no previous cycle information",()=>{
  expect(workerShiftSummary(cars,null).cars).toBe(0);
 });
});
