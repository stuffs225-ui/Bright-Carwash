import {describe,it,expect} from "vitest";
import {canInviteCarwashAccount,canModifyCarwashAccount} from "./carwashMemberPermissions";
describe("Carwash manager may onboard shared worker only, without escalation",()=>{
 it("manager may invite and disable worker but not manager or owner",()=>{
  expect(canInviteCarwashAccount("manager","worker")).toBe(true);
  expect(canInviteCarwashAccount("manager","manager")).toBe(false);
  expect(canModifyCarwashAccount("manager","worker","worker")).toBe(true);
  expect(canModifyCarwashAccount("manager","manager","worker")).toBe(false);
 });
 it("workers cannot manage any account",()=>{
  expect(canInviteCarwashAccount("worker","worker")).toBe(false);
  expect(canModifyCarwashAccount("worker","worker","worker")).toBe(false);
 });
});
