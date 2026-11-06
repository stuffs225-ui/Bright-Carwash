#!/usr/bin/env node
// Offline archive verification/recovery. Does NOT connect to a database.
// Never print decrypted customer records unless explicitly exporting to a secure file.
import {readFileSync,writeFileSync} from "node:fs";
import {createDecipheriv,createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";

export function inspectEncryptedBackup(bytes,keyBase64){
 const encoded=String(keyBase64||"").trim();
 if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw Error("Missing or invalid CARWASH_BACKUP_KEY_BASE64");
 const key=Buffer.from(encoded,"base64");
 if(key.length!==32||key.toString("base64")!==encoded)throw Error("Invalid encryption key");
 const marker=Buffer.from("BCW2-BACKUP-1\\n","utf8");
 if(bytes.length<=marker.length+28||!bytes.subarray(0,marker.length).equals(marker))
  throw Error("Unknown archive format");
 const i=marker.length;
 const decipher=createDecipheriv("aes-256-gcm",key,bytes.subarray(i,i+12));
 decipher.setAuthTag(bytes.subarray(i+12,i+28));
 const compressed=Buffer.concat([decipher.update(bytes.subarray(i+28)),decipher.final()]);
 const archive=JSON.parse(gunzipSync(compressed).toString("utf8"));
 if(archive.format!=="bright-carwash-v2"||archive.version!==1||!archive.tables||
    !archive.rowCounts||typeof archive.projectRef!=="string")
  throw Error("Archive content format invalid");
 for(const [name,rows] of Object.entries(archive.tables)){
  if(!Array.isArray(rows)||rows.length!==archive.rowCounts[name])
   throw Error("Archive table count mismatch: "+name);
 }
 const count=(table)=>archive.tables[table]?.length||0;
 const sum=(table,column)=>Math.round((archive.tables[table]||[]).reduce(
  (a,row)=>a+Number(row[column]||0),0)*100)/100;
 const summary={
  ok:true,archivedAt:archive.archivedAt,projectRef:archive.projectRef,
  sha256:createHash("sha256").update(bytes).digest("hex"),
  tableCount:Object.keys(archive.tables).length,
  rows:archive.rowCounts,
  cash:sum("entries","cash_paid"),card:sum("entries","card_paid"),
  expenses:sum("expenses","amount"),
  evidenceFiles:archive.storage?.["carwash-pos-evidence"]?.length||0
 };
 return {summary,archive};
}
function main(){
 const [file,flag,destination]=process.argv.slice(2);
 if(!file||flag&&flag!=="--export-json"||flag&&!destination)
  throw Error("Usage: node scripts/verify-carwash-backup.mjs file.bcw2 [--export-json /secure/path/restore.json]");
 const result=inspectEncryptedBackup(readFileSync(file),process.env.CARWASH_BACKUP_KEY_BASE64);
 if(flag==="--export-json"){
  writeFileSync(destination,JSON.stringify(result.archive,null,2),{flag:"wx",mode:0o600});
  result.summary.exportedTo=destination;
 }
 process.stdout.write(JSON.stringify(result.summary,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 try{main()}catch(error){process.stderr.write("Backup verification failed: "+(error?.message||"unknown error")+"\n");process.exitCode=1;}
}
