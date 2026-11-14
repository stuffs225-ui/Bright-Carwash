// Offline worker fallback with real IndexedDB AES-GCM but synthetic API/catalog.
const {webkit,devices}=require("playwright");
const fs=require("node:fs");
const assert=require("node:assert/strict");
(async()=>{
 const browser=await webkit.launch({headless:true});
 const context=await browser.newContext({...devices["iPhone 13"],serviceWorkers:"block"});
 const page=await context.newPage();
 const TOKEN="a".repeat(64),url="http://localhost:3000/w/"+TOKEN;
 const catalog={label:"fake",discountLimit:10,manualServiceEnabled:true,
  presets:[
   {id:"11111111-1111-4111-8111-111111111111",car_type:"سيارة صغيرة",service_type:"غسيل كامل",amount:25},
   {id:"22222222-2222-4222-8222-222222222222",car_type:"سيارة كبيرة",service_type:"غسيل كامل",amount:30}
  ],addons:[]};
 const html=fs.readFileSync("public/offline-worker.html","utf8");
 let showOffline=false;
 await page.route("**/w/"+TOKEN,async route=>{
  if(showOffline)await route.fulfill({contentType:"text/html",body:html});
  else await route.continue();
 });
 await page.route("**/api/worker-links/**",async route=>{
  const op=route.request().url();let json={};
  if(op.endsWith("/catalog"))json=catalog;
  else if(op.endsWith("/summary"))json={days:[]};
  else if(op.endsWith("/active"))json={cars:[]};
  else if(op.endsWith("/record"))json={ok:true,id:"fake"};
  await route.fulfill({json});
 });
 await page.goto(url);
 await page.getByRole("heading",{name:/Register cars/}).waitFor();
 await page.getByRole("button",{name:"Hausa"}).click();
 await page.getByRole("heading",{name:/Rijistar motoci/}).waitFor();
 await page.waitForFunction(async()=>{
  const req=indexedDB.open("bright-carwash-worker-encrypted-outbox-v1",2);
  return await new Promise(resolve=>{
   req.onsuccess=()=>{
    const db=req.result,tx=db.transaction("catalogs","readonly");
    const get=tx.objectStore("catalogs").getAll();
    get.onsuccess=()=>{const yes=get.result.length>0;db.close();resolve(yes);};
    get.onerror=()=>{db.close();resolve(false);};
   };
   req.onerror=()=>resolve(false);
  });
 });
 showOffline=true;
 await page.reload();
 await page.getByRole("heading",{name:/Rijistar motoci/}).waitFor();
 await page.getByRole("button",{name:/Babbar motar kaya/}).click();
 await page.getByLabel("Farashin wannan motar (SAR)").fill("55");
 assert.equal(await page.getByLabel("Farashin wannan motar (SAR)").inputValue(),"55");
 await page.getByRole("button",{name:"Biya a haɗe"}).click();
 await page.getByLabel("Kuɗin hannu",{exact:true}).fill("20");
 await page.getByLabel("Kuɗin POS",{exact:true}).fill("35");
 await page.getByRole("button",{name:"English"}).click();
 await page.getByLabel("Price for this car (SAR)").waitFor();
 assert.equal(await page.getByLabel("Price for this car (SAR)").inputValue(),"55");
 assert.equal(await page.getByLabel("Cash amount").inputValue(),"20");
 assert.equal(await page.getByLabel("POS amount").inputValue(),"35");
 await page.getByRole("button",{name:"Save car on device"}).click();
 await page.getByText("Car saved on device; it will sync when online.").waitFor();
 const rows=await page.evaluate(async()=>{
  const request=indexedDB.open("bright-carwash-worker-encrypted-outbox-v1",2);
  return await new Promise((resolve,reject)=>{
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction("records","readonly");
    const req=tx.objectStore("records").getAll();
    req.onsuccess=()=>{db.close();resolve(req.result);};
    req.onerror=()=>reject(req.error);
   };
   request.onerror=()=>reject(request.error);
  });
 });
 assert.equal(rows.length,1);
 assert.equal(rows[0].cipher?.length>0,true);
 assert.ok(!JSON.stringify(rows).includes('"cash":20'),"No plaintext amounts in offline queue");
 assert.equal(await page.evaluate(()=>localStorage.getItem("bright_carwash_worker_lang_v1")),"en");
 await page.reload();
 await page.getByRole("heading",{name:/Register cars/}).waitFor();
 assert.equal(await page.locator("html").getAttribute("dir"),"ltr");
 await page.getByRole("button",{name:"العربية"}).click();
 await page.getByRole("heading",{name:/تسجيل السيارات/}).waitFor();
 assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
 console.log("Offline worker AES-GCM v2 queue, truck manual price, mixed payment, three languages: passed");
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
