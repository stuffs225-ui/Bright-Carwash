import {NextResponse} from "next/server";
import {Resend} from "resend";
import {createHash} from "node:crypto";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {encryptBackup,parseBackupKey} from "@/lib/backupCrypto";

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
 "carwash_owner_devices"
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
async function evidenceArchive(admin:ReturnType<typeof createAdminClient>){
 const result:Array<{path:string;mime:string;body:string}>=[];
 let bytes=0;
 async function walk(prefix:string){
  for(let offset=0;;offset+=100){
   const {data,error}=await admin.storage.from("carwash-pos-evidence")
    .list(prefix,{limit:100,offset});
   if(error)throw Error("Unable to list POS evidence");
   const batch=data||[];
   for(const object of batch){
    if(!object.id){await walk(prefix+object.name+"/");continue;}
    const path=prefix+object.name;
    const {data:download,error:downloadError}=await admin.storage
     .from("carwash-pos-evidence").download(path);
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
  if(!email||!/^\S+@\S+\.\S+$/.test(email)||!from||!resendKey)
   return fail(503,"Encrypted offsite backup configuration is incomplete");
  const admin=createAdminClient();
  const tables:Record<string,unknown[]>={};
  for(const table of TABLES)tables[table]=await readAll(admin,table);
  const objects=await evidenceArchive(admin);
  const rowCounts=Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]));
  const archivedAt=new Date().toISOString();
  const payload={format:"bright-carwash-v2",version:1,archivedAt,
   projectRef:process.env.CARWASH_DATABASE_PROJECT_REF,
   rowCounts,tables,storage:{"carwash-pos-evidence":objects}};
  const encrypted=encryptBackup(payload,key);
  if(encrypted.byteLength>MAX_ARCHIVE_BYTES)return fail(413,"Encrypted backup exceeds storage size limit");
  const filename="daily/"+archivedAt.slice(0,10)+".bcw2";
  const upload=await admin.storage.from("backups").upload(filename,encrypted,{
   contentType:"application/octet-stream",upsert:false
  });
  if(upload.error){
   if(upload.error.message.toLowerCase().includes("already exists")||
      upload.error.message.toLowerCase().includes("duplicate"))
    return NextResponse.json({ok:true,skipped:true,reason:"Daily archive already exists"},
      {headers:NO_STORE});
   return fail(503,"Encrypted backup storage failed");
  }
  const hash=createHash("sha256").update(encrypted).digest("hex");
  const emailResult=await new Resend(resendKey).emails.send({
   from,to:email,subject:"Bright Carwash encrypted daily backup — "+archivedAt.slice(0,10),
   html:"<p>Encrypted carwash backup attached. The AES-256-GCM key is never included. Preserve the key separately.</p>",
   attachments:[{filename:archivedAt.slice(0,10)+".bcw2",content:encrypted.toString("base64")}]
  });
  if(emailResult.error)return fail(503,"Encrypted archive saved but offsite delivery failed");
  return NextResponse.json({ok:true,archivedAt,rowCounts,evidenceFiles:objects.length,sha256:hash,
   storagePath:filename,offsiteDelivered:true},{headers:NO_STORE});
 }catch{
  return fail(503,"Unable to produce verified encrypted backup");
 }
}
