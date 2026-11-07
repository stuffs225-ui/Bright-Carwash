import {NextResponse} from "next/server";
import {Resend} from "resend";
import {createHash} from "node:crypto";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {encryptBackup,decryptBackup,parseBackupKey} from "@/lib/backupCrypto";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const NO_STORE={"Cache-Control":"no-store, private"};
// Explicit allowlist: business records, supporting ledgers, audit history, and link metadata.
// No Supabase Auth passwords or service-role credentials are exported.
const TABLES=[
 "car_types","service_types","expense_types","settings","entries","expenses",
 "audit_log","error_log","entry_presets","workers","worker_ledger","app_members",
 "audit_events","legacy_source_rows","legacy_import_issues","ready_sms_outbox",
 "crew_shift_bonuses","accounting_months","accounting_month_report_versions",
 "carwash_shifts","carwash_shift_devices","carwash_shift_settlements","carwash_addons",
 "carwash_days","carwash_registered_devices","carwash_day_devices",
 "carwash_day_settlements","carwash_import_batches","carwash_pin_rate_limits",
 "carwash_manager_pin_verifiers","carwash_worker_links",
 "carwash_worker_link_submissions","carwash_owner_activation_links",
 "carwash_owner_devices",
 "carwash_entry_line_items","carwash_entry_readiness",
 "carwash_readiness_events","carwash_cash_movements",
 "carwash_photo_cleanup_log","carwash_addon_proposals"
] as const;
const MAX_ARCHIVE_BYTES=42*1024*1024;
const MAX_EVIDENCE_FILES=500;
const fail=(code:number,error:string)=>NextResponse.json({ok:false,error},{status:code,headers:NO_STORE});

async function readAll(admin:ReturnType<typeof createAdminClient>,table:string){
 const rows:unknown[]=[];
 for(let from=0;;from+=500){
  const {data,error}=await admin.from(table).select("*").range(from,from+499);
  if(error)throw Error("Unable to read backup table "+table);
  rows.push(...(data||[]));
  if((data||[]).length<500)break;
  if(rows.length>1000000)throw Error("Backup record limit exceeded");
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
  const tables:Record<string,unknown[]>={};
  for(const table of TABLES)tables[table]=await readAll(admin,table);
  const objects=await evidenceArchive(admin,"carwash-pos-evidence");
  const readyPhotos=await evidenceArchive(admin,"carwash-ready-photos");
  const rowCounts=Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]));
  const archivedAt=new Date().toISOString();
  const payload={format:"bright-carwash-v2",version:1,archivedAt,
   projectRef:process.env.CARWASH_DATABASE_PROJECT_REF,
   rowCounts,tables,storage:{"carwash-pos-evidence":objects,"carwash-ready-photos":readyPhotos}};
  const encrypted=encryptBackup(payload,key);
  if(encrypted.byteLength>MAX_ARCHIVE_BYTES)return fail(413,"Encrypted backup exceeds storage size limit");
  const filename="daily/"+archivedAt.slice(0,10)+".bcw2";
  let archive=encrypted;
  const upload=await admin.storage.from("backups").upload(filename,archive,{
   contentType:"application/octet-stream",upsert:false
  });
  if(upload.error){
   if(!/already exists|duplicate|409/i.test(upload.error.message))
    return fail(503,"Encrypted backup storage failed");
   // A retry must deliver the SAME immutable encrypted archive, not a
   // differently encrypted snapshot bearing the same daily filename.
   const previousArchive=await admin.storage.from("backups").download(filename);
   if(previousArchive.error||!previousArchive.data)
    return fail(503,"Previously encrypted archive could not be verified");
   archive=Buffer.from(await previousArchive.data.arrayBuffer());
   const decoded=decryptBackup(archive,key) as {format?:string;projectRef?:string};
   if(decoded.format!=="bright-carwash-v2"||
      decoded.projectRef!==process.env.CARWASH_DATABASE_PROJECT_REF)
    return fail(503,"Stored archive does not match this database");
  }
  const verify=await admin.storage.from("backups").download(filename);
  if(verify.error||!verify.data)return fail(503,"Stored encrypted archive could not be read back");
  const stored=Buffer.from(await verify.data.arrayBuffer());
  const restored=decryptBackup(stored,key) as {
   format?:string;version?:number;projectRef?:string;
   tables?:Record<string,unknown[]>;rowCounts?:Record<string,number>;
   storage?:Record<string,unknown[]>
  };
  if(restored.format!=="bright-carwash-v2"||restored.version!==1||
     restored.projectRef!==process.env.CARWASH_DATABASE_PROJECT_REF||
     !restored.tables||!restored.rowCounts||
     !Object.keys(restored.rowCounts).every(table=>
       Array.isArray(restored.tables?.[table])&&
       restored.tables?.[table].length===restored.rowCounts?.[table]))
   return fail(503,"Encrypted archive integrity verification failed");
  const hash=createHash("sha256").update(stored).digest("hex");
  const saved=await admin.from("settings").upsert({
   key:"backup_last_saved_at",value:archivedAt
  },{onConflict:"key"});
  if(saved.error)return fail(503,"Archive saved but status update failed");
  const checksum=await admin.from("settings").upsert({
   key:"backup_last_sha256",value:hash
  },{onConflict:"key"});
  if(checksum.error)return fail(503,"Archive saved but checksum status update failed");
  let offsiteDelivered=false;
  if(offsiteConfigured){
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
  const retention=await cleanExpiredReadyPhotos(admin).catch(()=>({
   removed:0,failed:0,status:"cleanup_unavailable"
  }));
  return NextResponse.json({ok:true,archivedAt,
   rowCounts:restored.rowCounts,
   evidenceFiles:restored.storage?.["carwash-pos-evidence"]?.length||0,
   readyPhotos:restored.storage?.["carwash-ready-photos"]?.length||0,
   photoRetention:retention,
   sha256:hash,storagePath:filename,archiveVerified:true,
   offsiteDelivered,offsiteConfigured,
   note:offsiteDelivered?"Encrypted offsite copy delivered":
    "Encrypted private storage backup complete; external email delivery not configured or not delivered"
  },{headers:NO_STORE});
 }catch{
  return fail(503,"Unable to produce verified encrypted backup");
 }
}
