"use client";
// Display-only translations for the shared worker-link UI. All operational IDs,
// prices, monetary values, status codes and WhatsApp customer messages remain untouched.
export type WorkerLocale="ha-NG"|"en"|"ar";
export const WORKER_LOCALE_KEY="bright_carwash_worker_lang_v1";
import HA from "@/public/locales/ha-NG.json";
import EN from "@/public/locales/en.json";
import AR from "@/public/locales/ar.json";
export type WorkerKey=keyof typeof AR;
const STRINGS:Record<WorkerKey,Record<WorkerLocale,string>>=
 Object.fromEntries((Object.keys(AR) as WorkerKey[]).map(key=>[key,{
  ar:AR[key],en:EN[key],"ha-NG":HA[key]
 }])) as Record<WorkerKey,Record<WorkerLocale,string>>;
export function workerText(lang:WorkerLocale,key:WorkerKey,vars?:Record<string,string|number>):string{
 const template:string=STRINGS[key][lang];
 return vars?template.replace(/\{(\w+)\}/g,(_,k:string)=>String(vars[k]??"")):template;
}
export function workerDirection(lang:WorkerLocale):"ltr"|"rtl"{return lang==="ar"?"rtl":"ltr";}
export function readWorkerLocale():WorkerLocale{
 if(typeof window==="undefined")return "en";
 try{
  const saved=window.localStorage.getItem(WORKER_LOCALE_KEY);
  if(saved==="ha-NG"||saved==="en"||saved==="ar")return saved;
  const cookie=document.cookie.match(/(?:^|; )carwash_worker_lang=(ha-NG|en|ar)(?:;|$)/);
  if(cookie)return cookie[1] as WorkerLocale;
 }catch{/* Browsers can block storage. */}
 return "en";
}
export function persistWorkerLocale(lang:WorkerLocale):void{
 if(typeof window==="undefined")return;
 try{localStorage.setItem(WORKER_LOCALE_KEY,lang);}catch{}
 try{document.cookie="carwash_worker_lang="+lang+"; Path=/w; Max-Age=31536000; SameSite=Lax";}catch{}
}
const CAR:Record<string,WorkerKey>={
 "سيارة صغيرة":"car.small","سيارة كبيرة":"car.large","شاحنة":"car.truck",
 "باص صغير":"car.smallBus","باص كبير":"car.largeBus","سيدان":"car.sedan","SUV":"car.suv"
};
const SERVICE:Record<string,WorkerKey>={
 "غسيل كامل":"service.full","غسيل خارجي":"service.exterior","غسيل بستم":"service.piston"
};
const ADDON:Record<string,WorkerKey>={
 "تعطير":"addon.perfume","واكس":"addon.wax","تنظيف إضافي":"addon.clean"
};
export function workerCarName(lang:WorkerLocale,name:string):string{
 return CAR[name]?workerText(lang,CAR[name]):lang==="ar"?name:workerText(lang,"service.custom");
}
export function workerServiceName(lang:WorkerLocale,name:string):string{
 return SERVICE[name]?workerText(lang,SERVICE[name]):lang==="ar"?name:workerText(lang,"service.custom");
}
export function workerAddonName(lang:WorkerLocale,name:string):string{
 return ADDON[name]?workerText(lang,ADDON[name]):lang==="ar"?name:workerText(lang,"addon.other");
}
export function workerMoney(value:number):string{
 return new Intl.NumberFormat("en-US",{maximumFractionDigits:2,minimumFractionDigits:2}).format(value)+" SAR";
}
export function workerDate(date:string,lang:WorkerLocale):string{
 if(lang==="ha-NG")return date; // Gregorian ISO, Latin digits; no English month names
 const locale=lang==="ar"?"ar-SA-u-ca-gregory-nu-latn":"en-GB";
 return new Date(date+"T12:00:00+03:00").toLocaleDateString(locale,
  {timeZone:"Asia/Riyadh",year:"numeric",month:"short",day:"numeric"});
}
export function workerTime(date:string,lang:WorkerLocale):string{
 const locale=lang==="ar"?"ar-SA-u-ca-gregory-nu-latn":"en-GB";
 return new Date(date).toLocaleTimeString(locale,
  {timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
}
// Backend messages may be Arabic, and are untrusted display data. Never expose
// untranslated server output or database internals to Hausa/English users.
export function workerMessage(lang:WorkerLocale,raw:string,fallback:WorkerKey="error.generic"):string{
 if(lang==="ar")return raw||workerText(lang,fallback);
 for(const [key,translations] of Object.entries(STRINGS)){
  if(translations.ar===raw)return workerText(lang,key as WorkerKey);
 }
 if(/مزامن|sync/i.test(raw))return workerText(lang,"error.sync");
 if(/السعر|price|discount|الخصم/i.test(raw))return workerText(lang,"error.payment");
 if(/رابط|link|صلاحية|authorization/i.test(raw))return workerText(lang,"error.invalidLink");
 if(/رقم|phone/i.test(raw))return workerText(lang,"error.phone");
 if(/صورة|photo|image/i.test(raw))return workerText(lang,"error.upload");
 return workerText(lang,fallback);
}
