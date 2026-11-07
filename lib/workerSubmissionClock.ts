/** A worker's device clock is not trusted for accounting.
 * Compare original device timestamp to server Riyadh date; refuse silent
 * rebooking on a new calendar day until manager reviews it.
 */
export function submissionInServerRiyadhDay(recordedAt:unknown,serverNow:Date):boolean{
 if(recordedAt===undefined||recordedAt===null)return true; // compatibility with queued v1 submissions
 if(typeof recordedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(recordedAt))
  return false;
 const stamp=new Date(recordedAt);
 if(!Number.isFinite(stamp.getTime()))return false;
 const nowMs=serverNow.getTime();
 if(stamp.getTime()>nowMs+120000||nowMs-stamp.getTime()>7*86400000)return false;
 const zoneDate=(d:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
 return zoneDate(stamp)===zoneDate(serverNow);
}
