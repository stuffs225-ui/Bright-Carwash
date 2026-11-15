/** Backup runtime health is independent of function completion callbacks:
 * a hard timeout cannot write a failure status into the database. */
export type BackupHealth="not_created"|"fresh"|"overdue"|"invalid_timestamp";
export function evaluateBackupHealth(lastSavedAt:string|null|undefined,now=Date.now()):{
 state:BackupHealth;ageHours:number|null
}{
 if(!lastSavedAt)return {state:"not_created",ageHours:null};
 const saved=Date.parse(lastSavedAt);
 if(!Number.isFinite(saved)||saved>now+5*60_000)
  return {state:"invalid_timestamp",ageHours:null};
 const age=(now-saved)/3600000;
 return {state:age>36?"overdue":"fresh",ageHours:Math.max(0,Math.round(age))};
}
