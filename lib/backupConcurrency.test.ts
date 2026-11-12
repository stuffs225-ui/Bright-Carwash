import {describe,it,expect} from "vitest";
import {mapConcurrent} from "./backupConcurrency";
describe("bounded backup reads",()=>{
 it("preserves the requested table order with a concurrency limit",async()=>{
  let active=0,maxActive=0;
  const values=Array.from({length:37},(_,i)=>i);
  const result=await mapConcurrent(values,4,async n=>{
   active++;maxActive=Math.max(active,maxActive);
   await new Promise<void>(resolve=>setTimeout(resolve,(n%3)+1));
   active--;return n*2;
  });
  expect(result).toEqual(values.map(x=>x*2));
  expect(maxActive).toBeLessThanOrEqual(4);
  expect(maxActive).toBeGreaterThan(1);
 });
 it("fails instead of writing a partial archive when any table fails",async()=>{
  await expect(mapConcurrent([1,2,3],2,async x=>{
   if(x===2)throw Error("table read failed");
   return x;
  })).rejects.toThrow("table read failed");
 });
 it("rejects invalid limits and supports empty table lists",async()=>{
  await expect(mapConcurrent([1],0,async x=>x)).rejects.toThrow();
  expect(await mapConcurrent<number,number>([],4,async x=>x)).toEqual([]);
 });
});
