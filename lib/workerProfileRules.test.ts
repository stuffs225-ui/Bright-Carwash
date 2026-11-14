import {describe,expect,it} from "vitest";
import {cleanWorkerProfile,validateWorkerProfile,type EditableWorkerProfile} from "./workerProfileRules";
const base:EditableWorkerProfile={name:"عامل تجريبي",worker_type:"worker",hourly_rate:0,notes:null,sort_order:1,active:true};
describe("Manager worker settings",()=>{
 it("allows name, role, notes, order and active status together",()=>{
  expect(validateWorkerProfile({...base,name:"موظف ثاني",worker_type:"team",hourly_rate:22.50,notes:"ملاحظة",sort_order:2,active:false})).toBeNull();
 });
 it("rejects empty names, negative/fractional wages and long notes",()=>{
  expect(validateWorkerProfile({...base,name:" " })).toContain("اسم");
  expect(validateWorkerProfile({...base,hourly_rate:-1})).toContain("الأجر");
  expect(validateWorkerProfile({...base,hourly_rate:0.009})).toContain("الأجر");
  expect(validateWorkerProfile({...base,notes:"x".repeat(501)})).toContain("500");
 });
 it("normalizes names and does not rewrite archival or old profile data",()=>{
  expect(cleanWorkerProfile({...base,name:"  عامل  ",notes:" test "}))
   .toMatchObject({name:"عامل",notes:"test",active:true});
  expect(base.name).toBe("عامل تجريبي");
 });
});
