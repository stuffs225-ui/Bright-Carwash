/** Presentation-only grouping of settlement days; never changes approval status. */
export type SettlementDayNav = {
 business_date: string;
 status: "open"|"awaiting_owner"|"approved";
 reported?: boolean;
};

export function settlementAttentionDays<T extends SettlementDayNav>(days: readonly T[]): T[] {
 return days.filter(day=>day.status!=="approved").sort((a,b)=>{
  const priority=(day:SettlementDayNav)=>day.status==="awaiting_owner"||day.reported===true?0:1;
  return priority(a)-priority(b)||b.business_date.localeCompare(a.business_date);
 });
}

export type SettlementArchiveMonth<T extends SettlementDayNav> = {
 month: string;
 label: string;
 days: T[];
};

export function settlementArchiveMonths<T extends SettlementDayNav>(
 days: readonly T[]
): SettlementArchiveMonth<T>[] {
 const sorted=days.filter(day=>day.status==="approved")
  .sort((a,b)=>b.business_date.localeCompare(a.business_date));
 const months=new Map<string,T[]>();
 for(const day of sorted){
  const month=day.business_date.slice(0,7);
  const bucket=months.get(month);
  if(bucket)bucket.push(day);
  else months.set(month,[day]);
 }
 return Array.from(months,([month,records])=>({
  month,
  label:new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn",{
   year:"numeric",month:"long",timeZone:"Asia/Riyadh"
  }).format(new Date(month+"-01T12:00:00Z")),
  days:records
 }));
}
