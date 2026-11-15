import {NextResponse} from "next/server";
import {managerAccess,NO_STORE} from "@/lib/carwashCapability";
import {REQUIRED_ARCHIVE_TABLES} from "@/lib/carwashBackupCatalog";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try{
  const access=await managerAccess(request);
  if(!access)return NextResponse.json({error:"صلاحية المدير مطلوبة"},{status:403,headers:NO_STORE});
  const [values,list]=await Promise.all([
   access.admin.from("settings").select("key,value")
    .in("key",["backup_last_saved_at","backup_last_sha256","backup_last_sent_at","backup_last_verified_at","backup_last_verified_sha256","backup_last_failed_at","backup_last_failure_reason","backup_last_media_complete","backup_last_media_warning","backup_last_table_names","backup_last_coverage_checked_at"]),
   access.admin.storage.from("backups").list("daily",{limit:10,sortBy:{column:"name",order:"desc"}})
  ]);
  if(values.error||list.error)return NextResponse.json({error:"تعذر قراءة حالة النسخ"},{status:503,headers:NO_STORE});
  const map=Object.fromEntries((values.data||[]).map(x=>[x.key,x.value]));
  const files=(list.data||[]).filter(x=>x.name?.endsWith(".bcw2"));
  const inventory=Array.isArray(map.backup_last_table_names)
   ?map.backup_last_table_names.filter((name:unknown)=>typeof name==="string") as string[]
   :null;
  const missingTables=REQUIRED_ARCHIVE_TABLES.filter(name=>!inventory?.includes(name));
  return NextResponse.json({ok:true,
   coverageVerified:!!inventory&&missingTables.length===0,
   coverageKnown:!!inventory,
   coveredTableCount:inventory?.length||0,
   expectedTableCount:REQUIRED_ARCHIVE_TABLES.length,
   missingTables,
   lastSavedAt:typeof map.backup_last_saved_at==="string"?map.backup_last_saved_at:null,
   lastSentAt:typeof map.backup_last_sent_at==="string"?map.backup_last_sent_at:null,
   lastVerifiedAt:typeof map.backup_last_verified_at==="string"?map.backup_last_verified_at:null,
   lastFailedAt:typeof map.backup_last_failed_at==="string"?map.backup_last_failed_at:null,
   lastVerifiedMatchesChecksum:!!(map.backup_last_verified_sha256&&map.backup_last_verified_sha256===map.backup_last_sha256),
   latestArchive:files[0]?.name||null,
   mediaArchiveComplete:map.backup_last_media_complete===true,
   mediaWarning:typeof map.backup_last_media_warning==="string"&&map.backup_last_media_warning!=="none"?map.backup_last_media_warning:null,
   archivedFilesShown:files.length,
   checksumAvailable:typeof map.backup_last_sha256==="string",
   offsiteConfigured:!!(process.env.RESEND_API_KEY&&process.env.CARWASH_BACKUP_EMAIL&&process.env.CARWASH_BACKUP_FROM_EMAIL),
   schedule:"03:00 UTC / 06:00 Asia/Riyadh",
   encryptionConfigured:!!process.env.CARWASH_BACKUP_KEY_BASE64
  },{headers:NO_STORE});
 }catch{return NextResponse.json({error:"حالة النسخ غير متاحة"},{status:503,headers:NO_STORE});}
}
