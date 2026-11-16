import {describe,expect,it} from "vitest";
import {ownerLinkKey,revealOwnerLink,sealOwnerLink} from "./ownerLinkVault";
const secret="r".repeat(65),project="https://placeholder.supabase.co";
const token="a".repeat(64),owner="11111111-1111-4111-8111-111111111111";
describe("one recoverable private manager URL",()=>{
 it("stores only authenticated encryption with a separate key domain",()=>{
  const key=ownerLinkKey(secret,project);
  const saved=sealOwnerLink(token,owner,key);
  expect(saved.startsWith("v1.")).toBe(true);
  expect(saved.includes(token)).toBe(false);
  expect(revealOwnerLink(saved,owner,key)).toBe(token);
 });
 it("blocks other managers and other Supabase project secrets",()=>{
  const saved=sealOwnerLink(token,owner,ownerLinkKey(secret,project));
  expect(()=>revealOwnerLink(saved,"22222222-2222-4222-8222-222222222222",ownerLinkKey(secret,project))).toThrow();
  expect(()=>revealOwnerLink(saved,owner,ownerLinkKey(secret,"https://another.example.co"))).toThrow();
 });
 it("rejects ciphertext edits without returning the manager secret",()=>{
  const key=ownerLinkKey(secret,project),saved=sealOwnerLink(token,owner,key);
  // Mutate the first encrypted byte, not the final base64url character:
  // the last sextet can contain unused bits (or already equal "A").
  const fields=saved.split(".");
  fields[3]=(fields[3][0]==="A"?"B":"A")+fields[3].slice(1);
  expect(()=>revealOwnerLink(fields.join("."),owner,key)).toThrow();
  expect(()=>revealOwnerLink("v1.bad",owner,key)).toThrow();
 });
 it("refuses use without a valid server encryption secret",()=>{
  expect(()=>sealOwnerLink(token,owner,ownerLinkKey("short",project))).toThrow();
 });
});
