/** Carwash day = 00:00:00..23:59:59 Asia/Riyadh; never device timezone. */
const TZ="Asia/Riyadh";
export function riyadhDayKey(value:Date|string):string{
 const date=typeof value==="string"?new Date(value):value;
 if(Number.isNaN(date.getTime()))throw Error("Invalid date");
 const fields=new Intl.DateTimeFormat("en-CA",{
  timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(date);
 const part=(type:string)=>fields.find(f=>f.type===type)?.value||"";
 return part("year")+"-"+part("month")+"-"+part("day");
}
export function dayIsFinished(day:string,now:Date=new Date()):boolean{
 return day < riyadhDayKey(now);
}
export type CalendarDay={business_date:string;status:"open"|"awaiting_owner"|"approved"};
export type CalendarEntry={
 id:string;business_date?:string|null;occurred_at:string;
 car_type?:string;cash_paid:number;card_paid:number;discount_amount?:number|null;pending?:boolean;
};
export function visibleWorkerCalendarEntries(entries:CalendarEntry[],days:CalendarDay[]):CalendarEntry[]{
 const unapproved=new Set(days.filter(d=>d.status!=="approved").map(d=>d.business_date));
 return entries.filter(e=>unapproved.has(e.business_date||riyadhDayKey(e.occurred_at)));
}
export function crewBonusEligible(carType:string|undefined){return carType==="سيارة صغيرة"||carType==="سيارة كبيرة";}
export function calendarDayTotals(entries:CalendarEntry[]){
 const sum=(key:"cash_paid"|"card_paid")=>Math.round(entries.reduce(
  (a,e)=>a+Math.round(Number(e[key]||0)*100),0))/100;
 return {cars:entries.length,cash:sum("cash_paid"),card:sum("card_paid"),
  collectiveTens:entries.filter(e=>crewBonusEligible(e.car_type)).length*10,pending:entries.filter(e=>e.pending).length};
}
