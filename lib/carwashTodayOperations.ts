export type CarwashStatus="washing"|"ready"|"delivered";
export type TodayEntry={id:string;car_type:string;cash_paid:number;card_paid:number};
export type StatusByEntry=ReadonlyMap<string,CarwashStatus>;
export function todayOperationsSummary(entries:readonly TodayEntry[],statuses:StatusByEntry){
 const counts:Record<CarwashStatus,number>={washing:0,ready:0,delivered:0};
 let cashCents=0,cardCents=0,crew=0;
 for(const e of entries){
  const s=statuses.get(e.id);
  counts[s==="ready"||s==="delivered"?s:"washing"]++;
  cashCents+=Math.round(Number(e.cash_paid)*100);
  cardCents+=Math.round(Number(e.card_paid)*100);
  if(["سيارة صغيرة","سيارة كبيرة","شاحنة"].includes(e.car_type))crew+=10;
 }
 return {cars:entries.length,counts,cash:Math.round(cashCents)/100,
  card:Math.round(cardCents)/100,crew};
}
