/** Prevent out-of-order async settlements from mixing different business days. */
export function isCurrentDayRead(
 requestedDay:string,requestVersion:number,
 currentDay:string,currentVersion:number
):boolean{
 return requestedDay.length===10 &&
  requestedDay===currentDay&&
  requestVersion===currentVersion;
}
