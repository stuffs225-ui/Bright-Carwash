import {describe,it,expect} from "vitest";
import {randomBytes} from "node:crypto";
import {workerLinkVaultKey,sealWorkerLinkToken,revealWorkerLinkToken} from "./workerLinkVault";
describe("manager-recoverable shared worker links",()=>{
 const key=workerLinkVaultKey("x".repeat(120),"https://example.supabase.co");
 const manager="11111111-1111-4111-8111-111111111111";
 const token=randomBytes(32).toString("hex");
 it("encrypts the live bearer token, and restores it only for the correct manager",()=>{
  const encoded=sealWorkerLinkToken(token,manager,key);
  expect(encoded).toMatch(/^v1[.]/);
  expect(encoded).not.toContain(token);
  expect(revealWorkerLinkToken(encoded,manager,key)).toBe(token);
  expect(()=>revealWorkerLinkToken(encoded,"different-manager",key)).toThrow();
 });
 it("rejects modified ciphertext and an unrelated key",()=>{
  const encoded=sealWorkerLinkToken(token,manager,key);
  expect(()=>revealWorkerLinkToken(encoded,manager,workerLinkVaultKey("y".repeat(120),"https://example.supabase.co"))).toThrow();
  const mutated=encoded.slice(0,-1)+(encoded.endsWith("A")?"B":"A");
  expect(()=>revealWorkerLinkToken(mutated,manager,key)).toThrow();
 });
 it("rejects malformed or weak settings without returning a token",()=>{
  expect(()=>sealWorkerLinkToken("short",manager,key)).toThrow();
  expect(()=>revealWorkerLinkToken("v1.bad",manager,key)).toThrow();
  expect(workerLinkVaultKey("short","https://example.supabase.co")).toHaveLength(0);
 });
 it("keeps recovered URLs stable across fresh requests",()=>{
  const first=workerLinkVaultKey("z".repeat(120),"scope");
  const second=workerLinkVaultKey("z".repeat(120),"scope");
  expect(first).toEqual(second);
  const sealed=sealWorkerLinkToken(token,manager,first);
  expect(revealWorkerLinkToken(sealed,manager,second)).toBe(token);
 });
});
