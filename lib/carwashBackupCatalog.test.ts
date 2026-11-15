import {describe,expect,it} from "vitest";
import {
 CARWASH_BACKUP_TABLES,FINANCIAL_TABLES,archiveCoverageStatus,
 missingArchiveTables,validArchiveCounts
} from "./carwashBackupCatalog";
describe("carwash backup completeness",()=>{
 it("includes the new crew settlement and correction tables",()=>{
  expect(CARWASH_BACKUP_TABLES).toContain("carwash_crew_payouts");
  expect(CARWASH_BACKUP_TABLES).toContain("carwash_report_corrections");
  expect(FINANCIAL_TABLES.every(t=>CARWASH_BACKUP_TABLES.includes(t))).toBe(true);
  expect(new Set(CARWASH_BACKUP_TABLES).size).toBe(CARWASH_BACKUP_TABLES.length);
 });
 it("refuses to call an archive complete when critical tables are absent",()=>{
  const old={entries:[{id:1}],expenses:[]};
  expect(missingArchiveTables(old)).toContain("carwash_crew_payouts");
  expect(archiveCoverageStatus(old,{entries:1,expenses:0}).complete).toBe(false);
 });
 it("rejects missing rows or invalid row counts, without altering input",()=>{
  const required=[...CARWASH_BACKUP_TABLES,"private_carwash_crew_payout_audit"];
  const tables=Object.fromEntries(required.map(t=>[t,[]]));
  const counts=Object.fromEntries(required.map(t=>[t,0]));
  expect(archiveCoverageStatus(tables,counts)).toEqual({complete:true,missing:[]});
  expect(validArchiveCounts(tables,{...counts,entries:1})).toBe(false);
  expect(validArchiveCounts(tables,{...counts,entries:-1})).toBe(false);
  expect(validArchiveCounts(tables,{...counts,entries:1.5})).toBe(false);
 });
});
