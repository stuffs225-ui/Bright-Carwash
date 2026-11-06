import {describe,it,expect} from "vitest";
import {validFourDigitPin,pinChangeIsValid} from "./carwashPinRules";
describe("Carwash four-digit personal PIN",()=>{
 it("requires exactly four digits without converting 0338 to numeric 338",()=>{
  expect(validFourDigitPin("0338")).toBe(true);
  expect(validFourDigitPin("0000")).toBe(true);
  expect(validFourDigitPin("338")).toBe(false);
  expect(validFourDigitPin(338)).toBe(false);
  expect(validFourDigitPin("03381")).toBe(false);
  expect(validFourDigitPin("03 8")).toBe(false);
 });
 it("requires a changed PIN",()=>{
  expect(pinChangeIsValid("0338","5182")).toBe(true);
  expect(pinChangeIsValid("0338","0338")).toBe(false);
 });
});
