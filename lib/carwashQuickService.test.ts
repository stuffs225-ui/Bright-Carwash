import {describe,expect,it} from "vitest";
import {parseRecentByCar,recommendedForCar,recentPresetForCar} from "./carwashQuickService";
const first={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",car_type:"سيارة صغيرة",service_type:"غسيل كامل",amount:25,sort_order:1};
const second={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",car_type:"سيارة صغيرة",service_type:"غسيل خارجي",amount:15,sort_order:2};
const truck={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",car_type:"شاحنة",service_type:"غسيل كامل",amount:50,sort_order:3};
describe("fast registration service reordering",()=>{
 it("keeps the official price order on a new device",()=>{
  expect(recommendedForCar([second,first,truck],"سيارة صغيرة",{})[0].id).toBe(first.id);
 });
 it("prioritizes only the stored active preset for that car size",()=>{
  expect(recommendedForCar([first,second,truck],"سيارة صغيرة",{"سيارة صغيرة":second.id})[0].id).toBe(second.id);
  expect(recentPresetForCar([first,second,truck],"شاحنة",{"سيارة صغيرة":second.id})).toBeNull();
 });
 it("never invents an expired or disabled preset",()=>{
  expect(recentPresetForCar([first], "سيارة صغيرة",{"سيارة صغيرة":second.id})).toBeNull();
 });
 it("rejects invalid stored preference data",()=>{
  expect(parseRecentByCar("garbage")).toEqual({});
  expect(parseRecentByCar(JSON.stringify({"سيارة صغيرة":second.id,evil:"test"}))).toEqual({"سيارة صغيرة":second.id});
 });
 it("does not rewrite the official saved service price",()=>{
  const sorted=recommendedForCar([first,second],"سيارة صغيرة",{"سيارة صغيرة":second.id});
  expect(sorted[0].amount).toBe(15);
  expect(first.amount).toBe(25);
 });
});
