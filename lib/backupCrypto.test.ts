import {describe,it,expect} from "vitest";
import {randomBytes} from "node:crypto";
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
 it("rejects malformed encryption keys",()=>{
  expect(parseBackupKey(key.toString("base64"))).toEqual(key);
  expect(()=>parseBackupKey("short")).toThrow();
 });
});
