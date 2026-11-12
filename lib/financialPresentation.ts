/** Presentation-only finance labels: these are NOT audited net profits.
 * Accounted amount = recorded customer collections - posted expenses.
 * Unposted wages/crew provisions and other accruals are excluded.
 */
export type OperatingResult={amount:number;status:"profit"|"loss"|"even";label:"ربح"|"خسارة"|"تعادل"};
const round2=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
export function operatingResult(revenue:number,expenses:number):OperatingResult{
 if(!Number.isFinite(revenue)||!Number.isFinite(expenses))throw Error("Invalid financial data");
 const net=round2(revenue-expenses);
 return {amount:Math.abs(net),status:net<0?"loss":net>0?"profit":"even",
  label:net<0?"خسارة":net>0?"ربح":"تعادل"};
}
/** Returns null when dividing by zero instead of misleading users with 0%. */
export function netProfitMarginPercent(revenue:number,expenses:number):number|null{
 if(!Number.isFinite(revenue)||!Number.isFinite(expenses))return null;
 if(revenue<=0)return null;
 return (revenue-expenses)/revenue*100;
}
const money=new Intl.NumberFormat("ar-SA-u-nu-latn",{
 minimumFractionDigits:0,maximumFractionDigits:2,
});
export function displaySar(value:number):string{
 return money.format(Math.abs(round2(value)))+" ر.س";
}
export function displayPercent(value:number|null):string{
 if(value===null||!Number.isFinite(value))return "غير متاح";
 return (value<0?"−":"")+Math.abs(value).toFixed(1)+"%";
}
export const OPERATING_RESULT_NOTE =
 "النتيجة المبدئية = الإيرادات المسجلة − المصروفات المسجلة، وتشمل أجور الغسيل الجماعية المسجلة تلقائيًا، ولا تشمل التكاليف غير المسجلة بعد.";
