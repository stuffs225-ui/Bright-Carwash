/** Saudi carwash four-digit PIN UX rules; server checks the same constraints. */
export function validFourDigitPin(value:unknown):value is string {
 return typeof value==="string" && /^\d{4}$/.test(value);
}
export function pinChangeIsValid(oldPin:unknown,newPin:unknown):boolean{
 return validFourDigitPin(oldPin)&&validFourDigitPin(newPin)&&oldPin!==newPin;
}
