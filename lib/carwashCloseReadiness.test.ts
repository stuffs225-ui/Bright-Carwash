import {describe,it,expect} from "vitest";
import {canCloseDay,dayCloseChecks,type DayCloseInput} from "./carwashCloseReadiness";
const ready:DayCloseInput={
 dayFinished:true,dataLoaded:true,undelivered:0,registeredDevices:2,
 unsealedDevices:0,actualCash:"110.00",actualNetwork:"200",
 cashMismatch:false,cardMismatch:false,differenceReason:""
};
describe("smart daily close checklist",()=>{
 it("passes after all deliveries, known device sync and cash review",()=>{
  expect(canCloseDay(ready)).toBe(true);
  expect(dayCloseChecks(ready).every(x=>x.state==="passed")).toBe(true);
 });
 it("keeps the day locked while any known device is unsealed",()=>{
  expect(canCloseDay({...ready,unsealedDevices:1})).toBe(false);
 });
 it("keeps the day locked for undelivered cars or unknown verification",()=>{
  expect(canCloseDay({...ready,undelivered:1})).toBe(false);
  expect(dayCloseChecks({...ready,dataLoaded:false,undelivered:null})
   .some(x=>x.state==="checking")).toBe(true);
 });
 it("does not authorize closing a day which is still in progress",()=>{
  expect(canCloseDay({...ready,dayFinished:false})).toBe(false);
 });
 it("requires a meaningful reason when a financial variance is detected",()=>{
  expect(canCloseDay({...ready,cardMismatch:true})).toBe(false);
  expect(canCloseDay({...ready,cardMismatch:true,differenceReason:"تفاوت الجهاز حسب الإيصال"})).toBe(true);
 });
 it("rejects invalid or empty cash and network fields",()=>{
  expect(canCloseDay({...ready,actualCash:""})).toBe(false);
  expect(canCloseDay({...ready,actualNetwork:"-1"})).toBe(false);
  expect(canCloseDay({...ready,actualCash:"0.009"})).toBe(false);
 });
 it("does not pretend to discover unknown offline devices",()=>{
  const checks=dayCloseChecks({...ready,registeredDevices:0});
  expect(checks.find(c=>c.id==="devices")?.message).toContain("لا توجد أجهزة مسجلة");
 });
});
