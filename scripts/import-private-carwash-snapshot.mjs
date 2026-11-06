// PRIVATE imported Google Sheets data must stay OFF public GitHub.
// Usage: node scripts/import-private-carwash-snapshot.mjs /secure/path/snapshot.json
//        node scripts/import-private-carwash-snapshot.mjs /secure/path/snapshot.json --apply
//
// Defaults to zero-write source validation. The --apply command REQUIRES:
//  CARWASH_DATABASE_PROJECT_REF, NEXT_PUBLIC_SUPABASE_URL,
//  SUPABASE_SERVICE_ROLE_KEY, CARWASH_IMPORT_APPROVED_SHA256.
// Never run against a project containing another business's data.
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

const input=process.argv[2]||"";
const apply=process.argv.includes("--apply");
const fail=(message)=>{console.error("IMPORT BLOCKED: "+message);process.exit(1);};
if(!input||input.startsWith("--"))fail("A local private JSON snapshot path is required.");
const bytes=readFileSync(input);
const actualHash=createHash("sha256").update(bytes).digest("hex");
const data=JSON.parse(bytes.toString("utf8"));
const m=data.manifest;
if(!m||m.kind!=="PRIVATE_BRIGHT_CARWASH_SHEETS_SNAPSHOT")fail("Wrong source file kind");
if(!/^[0-9a-f]{64}$/.test(m.source_sha256))fail("Missing original spreadsheet SHA");
if(!Array.isArray(data.entries)||!Array.isArray(data.expenses)||
 !Array.isArray(data.legacy_source_rows)||!Array.isArray(data.legacy_import_issues))
 fail("Required source arrays missing");
if(data.entries.length!==m.entry_count||data.expenses.length!==m.expense_count)
 fail("Entries/expenses count not equal to manifest");
if(new Set(data.entries.map(x=>x.legacy_ref)).size!==data.entries.length||
 new Set(data.expenses.map(x=>x.legacy_ref)).size!==data.expenses.length)
 fail("Duplicate source reference");
if(new Set(data.legacy_source_rows.map(x=>x.source_sheet+":"+x.source_row)).size
 !==data.legacy_source_rows.length)fail("Duplicate raw source row");
const sum=(items,key)=>Math.round(items.reduce((a,x)=>a+Number(x[key]||0),0)*100)/100;
if(sum(data.entries,"cash_paid")!==m.cash_total||
 sum(data.entries,"card_paid")!==m.card_total||
 sum(data.expenses,"amount")!==m.expense_total)
 fail("Source financial totals do not match");
if(data.entries.some(x=>!x.legacy_ref||!x.occurred_at||
 !x.car_type||!x.service_type||!Number.isFinite(x.cash_paid)||
 !Number.isFinite(x.card_paid)||x.cash_paid<0||x.card_paid<0)||
 data.expenses.some(x=>!x.legacy_ref||!x.occurred_at||
 !Number.isFinite(x.amount)||x.amount<=0))
 fail("Invalid normalized source row");
const countIssues={};
for(const issue of data.legacy_import_issues){
 const k=issue.issue_code;
 countIssues[k]=(countIssues[k]||0)+1;
}
if(JSON.stringify(countIssues)!==JSON.stringify(m.issue_codes))
 fail("Source reconciliation issue count mismatch");
const totals={
 cars:data.entries.length,expenses:data.expenses.length,rawRows:data.legacy_source_rows.length,
 cash:m.cash_total,card:m.card_total,recordedTotal:m.recorded_total,
 expensesSAR:m.expense_total,reconciliationIssues:data.legacy_import_issues.length,
 sourceLastModified:m.source_last_modified_at,packageSha256:actualHash
};
console.log("PRIVATE SNAPSHOT PREFLIGHT PASSED:");
console.log(JSON.stringify(totals,null,2));
if(!apply){
 console.log("DRY RUN ONLY: No Supabase tables, users, or existing Google Sheets were modified.");
 process.exit(0);
}
if(process.env.CARWASH_IMPORT_APPROVED_SHA256!==actualHash)
 fail("Approved exact snapshot SHA does not match");
const ref=process.env.CARWASH_DATABASE_PROJECT_REF||"";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const key=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
if(!/^[a-z0-9]{20}$/.test(ref)||!url||!key||
 new URL(url).hostname!==ref+".supabase.co")
 fail("Target independent carwash database is not verified");
if(Date.now()-new Date(m.source_last_modified_at).getTime()>48*3600*1000)
 fail("Snapshot older than 48 hours; re-export live Google Sheets before cutover");
if(Date.now()<new Date(m.source_last_modified_at).getTime())
 fail("Source modification timestamp lies in the future");

const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const previous=await supabase.from("carwash_import_batches").select("source_sha256,status");
if(previous.error)fail("Missing isolated-carwash import schema (apply migrations 0001..0023 first)");
if(previous.data?.some(x=>x.source_sha256!==m.source_sha256))
 fail("Database contains a different source snapshot: refuse duplicate import");
const manifest={
 source_sha256:m.source_sha256,
 source_spreadsheet_id:m.source_spreadsheet_id,
 source_modified_at:m.source_last_modified_at,
 expected_entries:m.entry_count,
 expected_expenses:m.expense_count,
 expected_cash:m.cash_total,expected_card:m.card_total,
 expected_expenses_amount:m.expense_total,status:"importing",
};
if(!previous.data?.some(x=>x.status==="verified")){
 const {error}=await supabase.from("carwash_import_batches")
  .upsert(manifest,{onConflict:"source_sha256"});
 if(error)fail("Could not create import tracking record");
}
function stableId(value){
 const hash=createHash("sha256")
  .update("bright-carwash|"+m.source_spreadsheet_id+"|"+value).digest();
 hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;
 const text=hash.subarray(0,16).toString("hex");
 return text.slice(0,8)+"-"+text.slice(8,12)+"-"+text.slice(12,16)+"-"+text.slice(16,20)+"-"+text.slice(20);
}
async function writeRows(table,source,conflict){
 const batchSize=200;
 for(let from=0;from<source.length;from+=batchSize){
  const chunk=source.slice(from,from+batchSize);
  const {error}=await supabase.from(table).upsert(chunk,{onConflict:conflict});
  if(error)fail(table+": batch "+from+" failed: "+error.message);
  if((from/batchSize)%10===0)
    console.log("imported "+table+": "+Math.min(source.length,from+chunk.length)+"/"+source.length);
 }
}
await writeRows("legacy_source_rows",data.legacy_source_rows,"source_sheet,source_row");
await writeRows("entries",
 data.entries.map(x=>({...x,id:stableId(x.legacy_ref)})),"id");
await writeRows("expenses",
 data.expenses.map(x=>({...x,id:stableId(x.legacy_ref)})),"id");
await writeRows("legacy_import_issues",
 data.legacy_import_issues,"source_sheet,source_row,issue_code");

async function countRows(table,selectFilter){
 let query=supabase.from(table).select("*",{count:"exact",head:true});
 if(selectFilter)query=query.not("legacy_ref","is",null);
 const res=await query;
 if(res.error)fail("Verification count unavailable for "+table);
 return res.count;
}
const [carsCount,expensesCount,rawCount,issuesCount]=await Promise.all([
 countRows("entries",true),countRows("expenses",true),
 countRows("legacy_source_rows",false),countRows("legacy_import_issues",false),
]);
async function sumFromDatabase(table,keys){
 let offset=0;let totals={};for(const key of keys)totals[key]=0;
 while(true){
  const result=await supabase.from(table)
   .select(["legacy_ref",...keys].join(",")).not("legacy_ref","is",null)
   .order("legacy_ref",{ascending:true}).range(offset,offset+499);
  if(result.error)fail("Could not verify imported finance rows for "+table);
  for(const row of result.data||[]){
   for(const key of keys)totals[key]+=Number(row[key]||0);
  }
  if((result.data||[]).length<500)break;
  offset+=500;
 }
 for(const key of keys)totals[key]=Math.round(totals[key]*100)/100;
 return totals;
}
const [financial,expenseMoney]=await Promise.all([
 sumFromDatabase("entries",["cash_paid","card_paid","legacy_recorded_total"]),
 sumFromDatabase("expenses",["amount"])
]);
const passed=carsCount===m.entry_count&&expensesCount===m.expense_count&&
 rawCount===data.legacy_source_rows.length&&issuesCount===data.legacy_import_issues.length&&
 financial.cash_paid===m.cash_total&&financial.card_paid===m.card_total&&
 financial.legacy_recorded_total===m.recorded_total&&
 expenseMoney.amount===m.expense_total;
const report={
 status:passed?"verified":"failed",actual_entries:carsCount,
 actual_expenses:expensesCount,actual_cash:financial.cash_paid,
 actual_card:financial.card_paid,
 actual_expenses_amount:expenseMoney.amount,
 verified_at:passed?new Date().toISOString():null,
};
const save=await supabase.from("carwash_import_batches")
 .update(report).eq("source_sha256",m.source_sha256);
if(save.error)fail("Failed to save import verification");
if(!passed)fail("Imported data did not reconcile fully. Do NOT go live.");
console.log("VERIFIED AGAINST THE ISOLATED LIVE DATABASE:",JSON.stringify(report));
