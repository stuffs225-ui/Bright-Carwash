import {describe,it,expect} from "vitest";
import {backupMediaBudgetRemaining,withinBackupDeadline} from "./carwashBackupBudget";
describe("daily encrypted backup serverless time budget",()=>{
 it("does not wait for optional photo archive after its deadline",()=>{
  expect(backupMediaBudgetRemaining(0,47000)).toBe(1000);
  expect(backupMediaBudgetRemaining(0,49000)).toBe(0);
 });
 it("accepts a completed backup stage",async()=>{
  await expect(withinBackupDeadline(Promise.resolve(8),100)).resolves.toBe(8);
 });
 it("fails a stage that cannot complete before the response budget",async()=>{
  await expect(withinBackupDeadline(new Promise<never>(()=>{}),5))
   .rejects.toThrow("backup_financial_read_deadline");
 });
});
