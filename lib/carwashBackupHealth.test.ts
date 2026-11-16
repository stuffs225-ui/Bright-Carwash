import {describe,it,expect} from "vitest";
import {evaluateBackupHealth} from "./carwashBackupHealth";
describe("backup overdue alerts",()=>{
 const now=Date.parse("2026-11-15T18:00:00Z");
 it("does not confuse a killed cron with a healthy recent backup",()=>{
  expect(evaluateBackupHealth("2026-11-14T03:33:00Z",now).state).toBe("overdue");
 });
 it("allows recent encrypted backups and warns after the daily grace period",()=>{
  expect(evaluateBackupHealth("2026-11-15T03:33:00Z",now).state).toBe("fresh");
  expect(evaluateBackupHealth(null,now).state).toBe("not_created");
 });
 it("fails closed on malformed or future timestamps",()=>{
  expect(evaluateBackupHealth("bad",now).state).toBe("invalid_timestamp");
  expect(evaluateBackupHealth("2026-12-15T00:00:00Z",now).state).toBe("invalid_timestamp");
 });
});
