import {describe,it,expect} from "vitest";
import {selectedAddonsTotal,isApprovedStaffPrice} from "./priceGovernance";
const presets=[{car_type:"سيارة صغيرة",service_type:"غسيل كامل",amount:25}];
const addons=[{id:"a",name:"تعطير",price:5,active:true},{id:"b",name:"خاص",price:3,active:false}];
const check=(cash:number,discount=0,selectedAddons:string[]=[])=>
 isApprovedStaffPrice({carType:"سيارة صغيرة",serviceType:"غسيل كامل",cash,card:0,discount,
  selectedAddons,presets,addons});
describe("Worker wash price must match manager-approved tariff",()=>{
 it("accepts original 25 SAR tariff",()=>expect(check(25)).toBe(true));
 it("accepts selected active extra and discounted net",()=>expect(check(20,10,["a"])).toBe(true));
 it("rejects arbitrary amount",()=>expect(check(1)).toBe(false));
 it("rejects worker discount over 10",()=>expect(check(14,11)).toBe(false));
 it("rejects missing or disabled extras",()=>{
  expect(()=>selectedAddonsTotal(addons,["b"])).toThrow();
  expect(()=>selectedAddonsTotal(addons,["a","a"])).toThrow();
 });
});
