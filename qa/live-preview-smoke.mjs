// Public, read-only health and unauthorized-write smoke against the exact Vercel preview.
// No real customer records, login sessions, secrets, or financial writes are used.
const base=String(process.env.PREVIEW_BASE_URL||"").replace(/\/$/,"");
if(!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(base))throw Error("Explicit Vercel preview URL required");
async function check(path,expected,{method="GET",body}={}){
 const response=await fetch(base+path,{method,headers:{"content-type":"application/json",
  ...(method!=="GET"?{origin:base}:{})},body:body?JSON.stringify(body):undefined,
  redirect:"manual",signal:AbortSignal.timeout(15000),cache:"no-store"});
 const text=await response.text();
 if(response.status!==expected){
  let diagnostic="";
  if(path==="/api/health"){
   const data=JSON.parse(text);
   diagnostic=" checks="+JSON.stringify(data.checks||{})+" status="+String(data.ok);
  }
  throw Error(path+": expected "+expected+", got "+response.status+diagnostic);
 }
 if(path==="/api/health"){
  const data=JSON.parse(text);
  if(data.ok!==true||!data.checks?.auth||!data.checks?.database||!data.checks?.privateBackupStorage)
   throw Error("Preview health dependencies not ready");
 }
 if(path!=="/"&&!response.headers.get("cache-control")?.includes("no-store"))
  throw Error("Sensitive route missing private no-store: "+path);
 console.log(method+" "+path+" -> "+response.status);
}
await check("/",200);
await check("/api/health",200);
await check("/api/manager-overview",403);
await check("/api/backup/status",403);
await check("/api/backup/verify",403);
await check("/api/inventory",403,{method:"POST",body:{op:"list"}});
await check("/api/worker-links/catalog",403,{method:"POST",body:{token:"invalid"}});
console.log("Vercel live HTTP smoke: PASS");
