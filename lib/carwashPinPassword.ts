import "server-only";
import {createHmac,timingSafeEqual} from "node:crypto";
import {validFourDigitPin} from "./carwashPinRules";

/**
 * Never store 4 digit PINs on GitHub, in a database row, or in the browser
 * beyond the password form. A secret server-only HMAC turns the short code
 * into a non-guessable Supabase Auth password.
 * Rate limiting is mandatory because 10,000 possible PINs is a weak factor.
 */
function pinPepper():string{
 const v=process.env.CARWASH_PIN_PEPPER;
 if(!v || v.length<32)throw new Error("Carwash PIN secret not configured");
 return v;
}
export function assertDedicatedCarwashDatabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
 const expected=process.env.CARWASH_DATABASE_PROJECT_REF||"";
 const hostname=url?new URL(url).hostname:"";
 if(!expected||!/^\w{20}$/.test(expected)||hostname!==expected+".supabase.co")
  throw new Error("Isolated Bright-Carwash database reference is not verified");
}
export function deriveCarwashAuthPassword(userId:string,pin:string):string{
 if(!/^[0-9a-f-]{36}$/i.test(userId)||!validFourDigitPin(pin))
  throw new Error("Invalid carwash account or PIN");
 // Stable Auth account ID lets the employee verify/change their phone
 // through Supabase OTP without invalidating the personal PIN.
 return "CarwashV2#"+createHmac("sha256",pinPepper())
  .update("pin-v2|"+userId+"|"+pin).digest("hex");
}
export function carwashRateKey(type:"phone"|"ip",value:string):string{
 return createHmac("sha256",pinPepper()).update("ratelimit-v1|"+type+"|"+value)
  .digest("hex");
}

/**
 * Independent HMAC verifier for manager phone/PIN.
 * Never replace the manager's Supabase Auth email/password when enrolling a PIN.
 * Only the service-role can read the verifier table.
 */
export function deriveManagerPinVerifier(userId:string,pin:string):string{
 if(!/^[0-9a-f-]{36}$/i.test(userId)||!validFourDigitPin(pin))
  throw new Error("Invalid account or PIN");
 return createHmac("sha256",pinPepper())
  .update("manager-pin-verifier-v1|"+userId+"|"+pin).digest("hex");
}
export function matchesManagerPinVerifier(stored:string,userId:string,pin:string):boolean{
 if(!/^[0-9a-f]{64}$/.test(stored)||!validFourDigitPin(pin))return false;
 return timingSafeEqual(Buffer.from(stored,"hex"),
  Buffer.from(deriveManagerPinVerifier(userId,pin),"hex"));
}
