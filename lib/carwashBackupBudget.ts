/** Prevent a 60s serverless hard kill from hiding failed daily backups. */
export async function withinBackupDeadline<T>(work:Promise<T>,millis:number):Promise<T>{
 if(!Number.isFinite(millis)||millis<=0)throw Error("backup_financial_read_deadline");
 let handle:ReturnType<typeof setTimeout>|null=null;
 try{
  return await Promise.race([
   work,
   new Promise<T>((_,reject)=>{
    handle=setTimeout(()=>reject(Error("backup_financial_read_deadline")),millis);
   })
  ]);
 }finally{if(handle!==null)clearTimeout(handle);}
}
/** Reserve time for upload, checksum verification, and the 503 response. */
export function backupMediaBudgetRemaining(startedAt:number,now:number,deadlineMs=48000):number{
 return Math.max(0,deadlineMs-Math.max(0,now-startedAt));
}
