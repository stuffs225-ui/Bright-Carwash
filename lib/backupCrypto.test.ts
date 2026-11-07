import {describe,it,expect} from "vitest";
import {randomBytes} from "node:crypto";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {parseBackupKey,encryptBackup,decryptBackup} from "./backupCrypto";
describe("encrypted carwash disaster recovery archive",()=>{
 const key=randomBytes(32);
 it("restores synthetic table rows byte-for-byte after encryption",()=>{
  const fake={format:"bright-carwash-v2",version:1,tables:{
   entries:[{id:"entry-test",cash_paid:20,card_paid:0,business_date:"2026-11-07"}],
   expenses:[{id:"expense-test",amount:5}],audit_events:[{id:1,action:"INSERT"}]
  }};
  const encoded=encryptBackup(fake,key);
  expect(decryptBackup(encoded,key)).toEqual(fake);
  expect(encoded.toString("utf8")).not.toContain("entry-test");
 });
 it("detects tampering and the wrong key",()=>{
  const encoded=encryptBackup({tables:{entries:[{id:"test"}]}},key);
  expect(()=>decryptBackup(encoded,randomBytes(32))).toThrow();
  encoded[encoded.length-1]^=1;
  expect(()=>decryptBackup(encoded,key)).toThrow();
 });
 it("verifies a recoverable encrypted archive through the independent CLI",()=>{
  const dir=mkdtempSync(join(tmpdir(),"carwash-backup-qa-"));
  try{
   const keyBase64=key.toString("base64");
   const fixture={format:"bright-carwash-v2",version:1,archivedAt:"2026-11-07T00:00:00Z",
    projectRef:"synthetic-test-only",tables:{
     entries:[{id:"synthetic-1",cash_paid:10,card_paid:5}],
     expenses:[{id:"synthetic-2",amount:3}]
    },rowCounts:{entries:1,expenses:1},storage:{"carwash-pos-evidence":[]}};
   const file=join(dir,"test.bcw2");
   writeFileSync(file,encryptBackup(fixture,key));
   const proc=spawnSync(process.execPath,["scripts/verify-carwash-backup.mjs",file],{
    cwd:process.cwd(),encoding:"utf8",env:{...process.env,CARWASH_BACKUP_KEY_BASE64:keyBase64}
   });
   expect(proc.status).toBe(0);
   const summary=JSON.parse(proc.stdout);
   expect(summary.ok).toBe(true);
   expect(summary.cash).toBe(10);
   expect(summary.card).toBe(5);
   expect(summary.expenses).toBe(3);
   expect(proc.stdout).not.toContain("synthetic-1");
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it("rejects malformed encryption keys",()=>{
  expect(parseBackupKey(key.toString("base64"))).toEqual(key);
  expect(()=>parseBackupKey("short")).toThrow();
 });
});
