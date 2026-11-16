#!/usr/bin/env node
/**
 * Compare live migration schema (from isolated synthetic PostgreSQL only)
 * against the explicit encrypted-backup manifest. This prevents future
 * tables silently being omitted from the daily financial archive.
 */
import {readFileSync} from "node:fs";
const path=process.argv[2];
if(!path){process.stderr.write("Usage: node check-carwash-backup-manifest.mjs <pg_tables.txt>\n");process.exit(2);}
const source=readFileSync("lib/carwashBackupCatalog.ts","utf8");
const match=source.match(/export const CARWASH_BACKUP_TABLES=\[([\s\S]*?)\] as const;/);
if(!match){process.stderr.write("Backup catalog missing explicit table manifest\n");process.exit(1);}
const declared=new Set([...match[1].matchAll(/"([a-z_]+)"/g)].map(x=>x[1]));
const actual=new Set(readFileSync(path,"utf8").split(/\r?\n/).map(x=>x.trim()).filter(Boolean));
const missing=[...actual].filter(x=>!declared.has(x));
const unknown=[...declared].filter(x=>!actual.has(x));
if(missing.length||unknown.length){
 process.stderr.write("Encrypted backup schema manifest mismatch\n"+
  JSON.stringify({missing,unknown})+"\n");
 process.exit(1);
}
if(declared.size!==[...match[1].matchAll(/"([a-z_]+)"/g)].length){
 process.stderr.write("Duplicate backed-up table names\n");process.exit(1);
}
process.stdout.write("Backup manifest covers all "+actual.size+" public tables in synthetic DB\n");
