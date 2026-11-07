import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {managerAccess,NO_STORE} from "@/lib/carwashCapability";
import {decryptBackup,parseBackupKey} from "@/lib/backupCrypto";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const fail=(status:number,error:string)=>NextResponse.json({ok:false,error},{status,headers:NO_STORE});
type Archived={
 format?:string;version?:number;projectRef?:string;archivedAt?:string;
 rowCounts?:Record<string,number>;tables?:Record<string,unknown[]>;storage?:Record<string,unknown[]>
};
export async function GET(request:Request){
 try{
  const access=await managerAccess(request);
  if(!access)return fail(403,"صلاحية المدير مطلوبة");
  const key=parseBackupKey(process.env.CARWASH_BACKUP_KEY_BASE64||"");
  const admin=access.admin;
  const {data:files,error:listError}=await admin.storage.from("backups")
   .list("daily",{limit:20,sortBy:{column:"name",order:"desc"}});
  if(listError)return fail(503,"تعذر استعراض النسخ المحفوظة");
  const last=files?.find(x=>x.name?.endsWith(".bcw2"));
  if(!last)return fail(404,"لا توجد نسخة مشفرة");
  const path="daily/"+last.name;
  const {data:object,error}=await admin.storage.from("backups").download(path);
  if(error||!object)return fail(503,"تعذر قراءة ملف النسخة");
  const bytes=Buffer.from(await object.arrayBuffer());
  if(bytes.length>42*1024*1024)return fail(413,"حجم ملف النسخة يتجاوز حد التدقيق");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  const archive=decryptBackup(bytes,key) as Archived;
  if(archive.format!=="bright-carwash-v2"||archive.version!==1||
    archive.projectRef!==process.env.CARWASH_DATABASE_PROJECT_REF||
    !archive.tables||!archive.rowCounts)throw Error("Backup payload structure does not match carwash");
  const tableNames=Object.keys(archive.rowCounts);
  for(const name of tableNames){
   const rows=archive.tables[name];
   if(!Array.isArray(rows)||rows.length!==archive.rowCounts[name]){
    throw Error("Archive row mismatch "+name);
   }
  }
  const totals=(table:string,key:string)=>Math.round(
   (archive.tables?.[table]||[]).reduce<number>((s,item)=>{
    const row=item as Record<string,unknown>;
    return s+Number(row[key]||0);
   },0)*100)/100;
  const getIds=(table:string)=>new Set((archive.tables?.[table]||[])
   .map(e=>(e as Record<string,unknown>).id).filter(Boolean));
  const entryIds=getIds("entries");
  const workerIds=getIds("workers");
  let brokenLedger=0,brokenLines=0,brokenReady=0;
  for(const e of archive.tables.worker_ledger||[]){
   const row=e as Record<string,unknown>;
   if(row.worker_id&&!workerIds.has(row.worker_id))brokenLedger++;
  }
  for(const e of archive.tables.carwash_entry_line_items||[]){
   const row=e as Record<string,unknown>;
   if(row.entry_id&&!entryIds.has(row.entry_id))brokenLines++;
  }
  for(const e of archive.tables.carwash_entry_readiness||[]){
   const row=e as Record<string,unknown>;
   if(row.entry_id&&!entryIds.has(row.entry_id))brokenReady++;
  }
  if(brokenLedger+brokenLines+brokenReady>0)
   throw Error("Archive does not preserve relational links");
  const config=await admin.from("settings").select("key,value")
   .in("key",["backup_last_sha256","backup_last_saved_at"]);
  if(config.error)return fail(503,"تعذر التأكد من مرجع النسخة");
  const map=Object.fromEntries((config.data||[]).map(x=>[x.key,x.value]));
  if(typeof map.backup_last_sha256==="string"&&
    map.backup_last_saved_at===archive.archivedAt&&
    map.backup_last_sha256!==sha256)
    throw Error("Archived checksum differs from stored expected digest");
  const verifiedAt=new Date().toISOString();
  const {error:writeError}=await admin.from("settings").upsert([
   {key:"backup_last_verified_at",value:verifiedAt},
   {key:"backup_last_verified_sha256",value:sha256}
  ],{onConflict:"key"});
  if(writeError)return fail(503,"نجح الفحص لكن تعذر توثيق نتيجته");
  return NextResponse.json({
   ok:true,verifiedAt,archiveDate:archive.archivedAt,
   filename:last.name,sha256,encrypted:true,
   validatedTableCount:tableNames.length,
   validatedArchivedRows:{
    cars:archive.rowCounts.entries||0,
    expenses:archive.rowCounts.expenses||0,
    workerLedger:archive.rowCounts.worker_ledger||0,
    invoiceLines:archive.rowCounts.carwash_entry_line_items||0
   },
   archivedTotals:{
    cash:totals("entries","cash_paid"),
    card:totals("entries","card_paid"),
    expenses:totals("expenses","amount")
   },
   relationshipChecks:{workerLedger:brokenLedger,invoiceLines:brokenLines,readiness:brokenReady},
   encryptedArchiveReadBackVerified:true,
   restorationToSeparateDatabaseTested:false,
   note:"تم فك التشفير والتحقق من المحتوى والعلاقات داخل الذاكرة دون تغيير الإنتاج. يلزم اختبار منفصل لاستعادة البيانات الحقيقية إلى قاعدة مستقلة."
  },{headers:NO_STORE});
 }catch{
  return fail(503,"فشل فحص التشفير أو سلامة النسخة المحفوظة؛ راجع مفتاح الخادم وملف النسخة.");
 }
}
