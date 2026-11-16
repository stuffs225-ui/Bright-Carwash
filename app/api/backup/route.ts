import {NextResponse} from "next/server";
import {Resend} from "resend";
import {createHash} from "node:crypto";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {encryptBackup,decryptBackup,parseBackupKey} from "@/lib/backupCrypto";
import {mapConcurrent} from "@/lib/backupConcurrency";
import {withinBackupDeadline,backupMediaBudgetRemaining} from "@/lib/carwashBackupBudget";
import {
 CARWASH_BACKUP_TABLES,REQUIRED_ARCHIVE_TABLES,PRIVATE_AUDIT_BACKUP_KEY,
 backupPrimaryKeys,archiveCoverageStatus,type CarwashBackupTable
} from "@/lib/carwashBackupCatalog";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const NO_STORE={"Cache-Control":"no-store, private"};
// The versioned manifest is audited in lib/carwashBackupCatalog.ts.
// No Supabase Auth passwords or service-role credentials are exported.
const TABLES=CARWASH_BACKUP_TABLES;
const MAX_ARCHIVE_BYTES=42*1024*1024;
const MAX_EVIDENCE_FILES=500;
const fail=(code:number,error:string)=>NextResponse.json({ok:false,error},{status:code,headers:NO_STORE});
async function backupErrorStatus(code:number,error:string){
 try{
  const admin=createAdminClient();
  await admin.from("settings").upsert([
   {key:"backup_last_failed_at",value:new Date().toISOString()},
   {key:"backup_last_failure_reason",value:code===504?"تجاوزت قراءة البيانات مهلة النسخ الآمن؛ لم تكتمل النسخة":"تعذر إكمال النسخ المشفر أو التحقق منه"}
  ],{onConflict:"key"});
 }catch{/* Never block the error response if database logging is unavailable. */}
 return fail(code,error);
}

/**
 * Stable keyset reads prevent pagination from skipping/doubling records when
 * new rows arrive between pages. The day-device composite key uses ordered
 * offset paging and is checked again through the archive integrity validation.
 * A consistent cross-table DB snapshot remains a future prerequisite for
 * claiming full disaster-recovery certification.
 */
async function readAll(admin:ReturnType<typeof createAdminClient>,table:CarwashBackupTable){
 const rows:Record<string,unknown>[]=[];
 const keys=backupPrimaryKeys(table);
 const pageSize=1000;
 if(keys.length>1){
  for(let from=0;;from+=pageSize){
   let query=admin.from(table).select("*");
   for(const key of keys)query=query.order(key,{ascending:true});
   const {data,error}=await query.range(from,from+pageSize-1);
   if(error)throw Error("Unable to read backup table "+table);
   rows.push(...(data||[]));
   if(rows.length>1000000)throw Error("Backup record limit exceeded");
   if((data||[]).length<pageSize)break;
  }
  return rows;
 }
 const key=keys[0];
 let cursor:string|number|null=null;
 for(;;){
  let query=admin.from(table).select("*").order(key,{ascending:true}).limit(pageSize);
  if(cursor!==null)query=query.gt(key,cursor);
  const {data,error}=await query;
  if(error)throw Error("Unable to read backup table "+table);
  const page=(data||[]) as Record<string,unknown>[];
  if(page.length){
   const last=page[page.length-1][key];
   if(typeof last!=="string"&&typeof last!=="number")
    throw Error("Missing backup primary key "+table+"."+key);
   if(cursor!==null&&String(last)===String(cursor))
    throw Error("Backup pagination did not advance "+table);
   cursor=last;
   rows.push(...page);
  }
  if(rows.length>1000000)throw Error("Backup record limit exceeded");
  if(page.length<pageSize)break;
 }
 return rows;
}
async function readCrewAudit(admin:ReturnType<typeof createAdminClient>){
 const rows:Record<string,unknown>[]=[];
 let cursor=0;
 for(;;){
  const {data,error}=await admin.rpc("carwash_backup_crew_payout_audit",{
   p_after_id:cursor,p_limit:1000
  });
  if(error)throw Error("Unable to read private crew payout audit");
  const page=(data||[]) as Record<string,unknown>[];
  if(page.length){
   const id=Number(page[page.length-1].id);
   if(!Number.isSafeInteger(id)||id<=cursor)
    throw Error("Private audit backup pagination failed");
   rows.push(...page);cursor=id;
  }
  if(rows.length>1000000)throw Error("Private audit backup record limit exceeded");
  if(page.length<1000)break;
 }
 return rows;
}
async function evidenceArchive(admin:ReturnType<typeof createAdminClient>,bucket:string){
 const result:Array<{path:string;mime:string;body:string}>=[];
 let bytes=0;
 async function walk(prefix:string){
  for(let offset=0;;offset+=100){
   const {data,error}=await admin.storage.from(bucket)
    .list(prefix,{limit:100,offset});
   if(error)throw Error("Unable to list POS evidence");
   const batch=data||[];
   for(const object of batch){
    if(!object.id){await walk(prefix+object.name+"/");continue;}
    const path=prefix+object.name;
    const {data:download,error:downloadError}=await admin.storage
     .from(bucket).download(path);
    if(downloadError||!download)throw Error("Unable to download POS evidence");
    const buffer=Buffer.from(await download.arrayBuffer());
    bytes+=buffer.length;
    if(result.length>=MAX_EVIDENCE_FILES||bytes>MAX_ARCHIVE_BYTES)
     throw Error("POS evidence archive limit exceeded");
    result.push({path,mime:object.metadata?.mimetype||"application/octet-stream",
     body:buffer.toString("base64")});
   }
   if(batch.length<100)break;
  }
 }
 await walk("");
 return result;
}
/** Purge only photos older than the manager's configured retention AFTER a
 * verified encrypted backup has captured today's photo bytes.
 * This is bounded per run to protect the free-function time budget.
 */
async function cleanExpiredReadyPhotos(admin:ReturnType<typeof createAdminClient>){
 const config=await admin.from("settings").select("value")
  .eq("key","ready_photo_retention_days").maybeSingle();
 if(config.error)return {removed:0,failed:0,status:"policy_unavailable"};
 const requested=Number(config.data?.value??30);
 const days=Number.isInteger(requested)&&requested>=1&&requested<=365?requested:30;
 const cutoff=new Date(Date.now()-days*86400000).toISOString();
 const older=await admin.from("carwash_entry_readiness")
  .select("entry_id,photo_path").not("photo_path","is",null)
  .lt("updated_at",cutoff).limit(30);
 if(older.error)return {removed:0,failed:0,status:"query_failed"};
 let removed=0,failed=0;
 for(const image of older.data||[]){
  const path=image.photo_path;
  if(typeof path!=="string"||!path.startsWith("active/"+image.entry_id+"/")){
   failed++;continue;
  }
  const del=await admin.storage.from("carwash-ready-photos").remove([path]);
  if(del.error){failed++;continue;}
  const update=await admin.from("carwash_entry_readiness")
   .update({photo_path:null}).eq("entry_id",image.entry_id).eq("photo_path",path);
  if(update.error){failed++;continue;}
  const record=await admin.from("carwash_photo_cleanup_log").insert({
   entry_id:image.entry_id,object_path:path,reason:"configured_retention"
  });
  if(record.error){failed++;continue;}
  removed++;
 }
 return {removed,failed,status:failed?"partial":"ok",retentionDays:days};
}

export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<16||request.headers.get("authorization")!=="Bearer "+secret)
  return fail(401,"Unauthorized");
 const startedAt=Date.now();
 try{
  assertDedicatedCarwashDatabase();
  const key=parseBackupKey(process.env.CARWASH_BACKUP_KEY_BASE64||"");
  const email=(process.env.CARWASH_BACKUP_EMAIL||"").trim();
  const from=(process.env.CARWASH_BACKUP_FROM_EMAIL||"").trim();
  const resendKey=process.env.RESEND_API_KEY;
  // A free private-storage archive must still work without an email service.
  // External offsite delivery remains an optional later enhancement.
  const offsiteConfigured=!!(email&&/^\S+@\S+\.\S+$/.test(email)&&from&&resendKey);
  const admin=createAdminClient();
  // Daily immutable filenames avoid duplicate archives and extra storage usage.
  // Bound concurrent table fetches: sequential 40+ Supabase queries can exceed
  // the 60s serverless runtime; retaining order keeps archive determinism.
  const tables=await withinBackupDeadline((async()=>{
   const pairs=await mapConcurrent(TABLES,8,async table=>
    [table,await readAll(admin,table)] as const);
   const snapshot:Record<string,unknown[]>=Object.fromEntries(pairs);
   snapshot[PRIVATE_AUDIT_BACKUP_KEY]=await readCrewAudit(admin);
   return snapshot;
  })(),43000);
  const missing=archiveCoverageStatus(tables,Object.fromEntries(
   Object.entries(tables).map(([name,rows])=>[name,rows.length])
  ));
  if(!missing.complete)throw Error("Critical backup tables unavailable: "+missing.missing.join(","));
  // Financial records take priority. When evidence exceeds the free-function
  // budget, save a VERIFIED financial archive instead of losing ALL backups.
  // Media is explicitly marked unprotected and retention cleanup is forbidden.
  let objects:Array<{path:string;mime:string;body:string}>=[];
  let readyPhotos:Array<{path:string;mime:string;body:string}>=[];
  let mediaComplete=true;
  let mediaWarning:string|null=null;
  const mediaBudget=backupMediaBudgetRemaining(startedAt,Date.now(),48000);
  if(mediaBudget<2000){
   mediaComplete=false;mediaWarning="media_skipped_to_preserve_financial_archive";
  }else{
   try{
    [objects,readyPhotos]=await withinBackupDeadline(Promise.all([
     evidenceArchive(admin,"carwash-pos-evidence"),
     evidenceArchive(admin,"carwash-ready-photos")
    ]),mediaBudget);
   }catch{
    mediaComplete=false;mediaWarning="media_archive_limit_or_storage_error";
    objects=[];readyPhotos=[];
   }
  }
  const rowCounts=Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]));
  const archivedAt=new Date().toISOString();
  const payload:{format:string;version:number;archivedAt:string;projectRef:string|undefined;
    rowCounts:Record<string,number>;tables:Record<string,unknown[]>;
    mediaComplete:boolean;storage:Record<string,Array<{path:string;mime:string;body:string}>>}={
   format:"bright-carwash-v2",version:1,archivedAt,
   projectRef:process.env.CARWASH_DATABASE_PROJECT_REF,rowCounts,tables,
   mediaComplete,storage:{"carwash-pos-evidence":objects,"carwash-ready-photos":readyPhotos}
  };
  let encrypted=encryptBackup(payload,key);
  if(encrypted.byteLength>MAX_ARCHIVE_BYTES&&mediaComplete){
   mediaComplete=false;mediaWarning="media_payload_exceeded_archive_limit";
   payload.mediaComplete=false;
   payload.storage={"carwash-pos-evidence":[],"carwash-ready-photos":[]};
   encrypted=encryptBackup(payload,key);
  }
  if(encrypted.byteLength>MAX_ARCHIVE_BYTES)
   return await backupErrorStatus(413,"Financial archive itself exceeds size limit");
  const filename="daily/"+archivedAt.slice(0,10)+".bcw2";
  let archive=encrypted;
  const upload=await admin.storage.from("backups").upload(filename,archive,{
   contentType:"application/octet-stream",upsert:false
  });
  if(upload.error){
   if(!/already exists|duplicate|409/i.test(upload.error.message))
    return await backupErrorStatus(503,"Encrypted backup storage failed");
   // A retry must deliver the SAME immutable encrypted archive, not a
   // differently encrypted snapshot bearing the same daily filename.
   const previousArchive=await admin.storage.from("backups").download(filename);
   if(previousArchive.error||!previousArchive.data)
    return await backupErrorStatus(503,"Previously encrypted archive could not be verified");
   archive=Buffer.from(await previousArchive.data.arrayBuffer());
   const decoded=decryptBackup(archive,key) as {format?:string;projectRef?:string};
   if(decoded.format!=="bright-carwash-v2"||
      decoded.projectRef!==process.env.CARWASH_DATABASE_PROJECT_REF)
    return await backupErrorStatus(503,"Stored archive does not match this database");
  }
  const verify=await admin.storage.from("backups").download(filename);
  if(verify.error||!verify.data)return await backupErrorStatus(503,"Stored encrypted archive could not be read back");
  const stored=Buffer.from(await verify.data.arrayBuffer());
  const restored=decryptBackup(stored,key) as {
   format?:string;version?:number;projectRef?:string;archivedAt?:string;
   tables?:Record<string,unknown[]>;rowCounts?:Record<string,number>;
   mediaComplete?:boolean;storage?:Record<string,unknown[]>
  };
  if(restored.format!=="bright-carwash-v2"||restored.version!==1||
     restored.projectRef!==process.env.CARWASH_DATABASE_PROJECT_REF||
     !archiveCoverageStatus(restored.tables,restored.rowCounts).complete)
   return await backupErrorStatus(503,"Encrypted archive lacks complete required table coverage");
  const hash=createHash("sha256").update(stored).digest("hex");
  // The archive may preexist from an earlier daily CRON run: never claim
  // a fresh snapshot if this was only a duplicate-archive verification.
  const actualArchivedAt=restored.archivedAt||archivedAt;
  const actualMediaComplete=restored.mediaComplete===true||
   (restored.mediaComplete===undefined&&
    Array.isArray(restored.storage?.["carwash-pos-evidence"])&&
    Array.isArray(restored.storage?.["carwash-ready-photos"]));
  const saved=await admin.from("settings").upsert([
   {key:"backup_last_saved_at",value:actualArchivedAt},
   {key:"backup_last_table_names",value:[...REQUIRED_ARCHIVE_TABLES]},
   {key:"backup_last_coverage_checked_at",value:new Date().toISOString()}
  ],{onConflict:"key"});
  if(saved.error)return await backupErrorStatus(503,"Archive saved but status update failed");
  const checksum=await admin.from("settings").upsert({
   key:"backup_last_sha256",value:hash
  },{onConflict:"key"});
  if(checksum.error)return await backupErrorStatus(503,"Archive saved but checksum status update failed");
  const mediaStatus=await admin.from("settings").upsert([
   {key:"backup_last_media_complete",value:actualMediaComplete},
   {key:"backup_last_media_warning",value:actualMediaComplete?"none":mediaWarning||"media_archive_incomplete"}
  ],{onConflict:"key"});
  if(mediaStatus.error)return await backupErrorStatus(503,"Unable to record media backup integrity status");
  let offsiteDelivered=false;
  if(offsiteConfigured&&backupMediaBudgetRemaining(startedAt,Date.now(),52000)>4000){
   const emailResult=await new Resend(resendKey!).emails.send({
    from,to:email,subject:"Bright Carwash encrypted daily backup — "+archivedAt.slice(0,10),
    html:"<p>Encrypted daily carwash archive attached. The AES-256-GCM key is kept separately on the server.</p>",
    attachments:[{filename:archivedAt.slice(0,10)+".bcw2",content:stored.toString("base64")}]
   });
   offsiteDelivered=!emailResult.error;
   if(offsiteDelivered){
    await admin.from("settings").upsert({
     key:"backup_last_sent_at",value:archivedAt
    },{onConflict:"key"});
   }
  }
  // An archive must pass cryptographic verification before any image expires.
  const retention=actualMediaComplete&&backupMediaBudgetRemaining(startedAt,Date.now(),53000)>6000
   ?await cleanExpiredReadyPhotos(admin).catch(()=>({
     removed:0,failed:0,status:"cleanup_unavailable"
    }))
   :{removed:0,failed:0,status:"skipped_due_to_time_or_media"};
  return NextResponse.json({ok:true,archivedAt:actualArchivedAt,
   financialArchiveVerified:true,mediaArchiveComplete:actualMediaComplete,
   mediaWarning:actualMediaComplete?null:mediaWarning||"Media not included in encrypted archive",
   rowCounts:restored.rowCounts,
   evidenceFiles:restored.storage?.["carwash-pos-evidence"]?.length||0,
   readyPhotos:restored.storage?.["carwash-ready-photos"]?.length||0,
   photoRetention:retention,
   sha256:hash,storagePath:filename,archiveVerified:true,
   offsiteDelivered,offsiteConfigured,
   note:actualMediaComplete
    ?(offsiteDelivered?"Encrypted full offsite copy delivered":
      "Encrypted full private-storage backup complete; external delivery may be unavailable")
    :"FINANCIAL RECORDS ONLY: Media archive incomplete. Photo deletion blocked. Operator action required."
  },{headers:NO_STORE});
 }catch(e){
  if(e instanceof Error&&e.message==="backup_financial_read_deadline")
   return await backupErrorStatus(504,"Encrypted backup could not complete financial reads before safe timeout");
  return await backupErrorStatus(503,"Unable to produce verified encrypted backup");
 }
}
