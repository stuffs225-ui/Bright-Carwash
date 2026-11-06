import {describe,it,expect} from "vitest";
import {parseCarwashRecoveryLink} from "./carwashRecoveryLink";
const base="https://qsobrjtfyofmjeswktvb.supabase.co";
const token="a".repeat(64);
describe("carwash recovery links",()=>{
 it("verifies an unclicked original magic link despite a stale localhost redirect",()=>{
  expect(parseCarwashRecoveryLink(
   base+"/auth/v1/verify?token="+token+"&type=magiclink&redirect_to=http%3A%2F%2Flocalhost%3A3000",base
  )).toEqual({kind:"otp",token_hash:token,type:"magiclink"});
 });
 it("supports a token_hash link from a recovery email",()=>{
  expect(parseCarwashRecoveryLink(base+"/auth/v1/verify?token_hash="+token+"&type=recovery",base).type).toBe("recovery");
 });
 it("rejects localhost without the verified session fragment",()=>{
  expect(()=>parseCarwashRecoveryLink("http://localhost:3000",base)).toThrow(/localhost/);
 });
 it("recovers a localhost auth response without needing the email link again",()=>{
  expect(parseCarwashRecoveryLink("http://localhost:3000/#access_token=access&refresh_token=refresh",base))
   .toEqual({kind:"session",access_token:"access",refresh_token:"refresh"});
 });
 it("rejects unrelated domains and missing one-time tokens",()=>{
  expect(()=>parseCarwashRecoveryLink("https://attacker.invalid/auth/v1/verify?token="+token+"&type=magiclink",base)).toThrow();
  expect(()=>parseCarwashRecoveryLink(base+"/auth/v1/verify?type=magiclink",base)).toThrow(/رمز تحقق/);
 });
});
