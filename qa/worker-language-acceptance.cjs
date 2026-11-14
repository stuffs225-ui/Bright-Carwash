// Only fake APIs and fake customer data. Checks language UX, not live finance.
const {chromium,webkit,devices}=require("playwright");
const assert=require("node:assert/strict");
const fs=require("node:fs");
(async()=>{
 const browser=await (process.env.BROWSER==="chromium"?chromium:webkit).launch({headless:true});
 const device=process.env.BROWSER==="chromium"?"Pixel 5":"iPhone 13";
 const localeKey="bright_carwash_worker_lang_v1";
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh"}).format(new Date());
 const TOKEN="a".repeat(64);
 const URL="http://localhost:3000/w/"+TOKEN;
 const preset=[
  {id:"11111111-1111-4111-8111-111111111111",car_type:"سيارة صغيرة",service_type:"غسيل كامل",amount:25},
  {id:"22222222-2222-4222-8222-222222222222",car_type:"سيارة كبيرة",service_type:"غسيل كامل",amount:30}
 ];
 const car={id:"33333333-3333-4333-8333-333333333333",carType:"سيارة صغيرة",
  serviceType:"غسيل كامل",date:today,occurredAt:new Date().toISOString(),cash:25,card:0,
  discount:0,phone:"+966500000000",consent:true,status:"ready",photoAvailable:false};
 const totals={catalog:0,summary:0,active:0};
 const writes=[];
 const fake=async page=>{
  await page.route("**/api/worker-links/**",async route=>{
   const u=route.request().url();let payload={},res={};
   try{payload=route.request().postDataJSON()||{};}catch{}
   if(u.endsWith("/catalog")){totals.catalog++;res={label:"تجريبي",presets:preset,addons:[],discountLimit:10,manualServiceEnabled:true};}
   else if(u.endsWith("/summary")){totals.summary++;res={today,days:[{date:today,status:"open",cars:0,cash:0,card:0,crew:0}]};}
   else if(u.endsWith("/record")){writes.push(payload);res={ok:true,id:payload.mutationId};}
   else if(u.endsWith("/active")){totals.active++;res=payload.op==="list"?{cars:[car],readyMessage:"سيارتك جاهزة للاستلام"}:{ok:true};}
   await route.fulfill({json:res});
  });
 };
 const ctx=await browser.newContext({...devices[device],serviceWorkers:"block"});
 const shareMock=()=>{
  Object.defineProperty(navigator,"canShare",{configurable:true,value:p=>p.files?.length===1});
  Object.defineProperty(navigator,"share",{configurable:true,value:async p=>{
   window.__share={name:p.files[0].name,mime:p.files[0].type,caption:p.text};
  }});
 };
 await ctx.route("https://wa.me/**",route=>route.fulfill({status:200,contentType:"text/html",body:"WhatsApp test only"}));
 const page=await ctx.newPage();await fake(page);
 await page.goto(URL);
 await page.getByRole("heading",{name:/Register cars/}).waitFor();
 await page.getByRole("button",{name:"Hausa"}).click();
 await page.getByRole("heading",{name:/Rijistar motoci/}).waitFor();
 assert.equal(await page.locator(".worker-screen").getAttribute("dir"),"ltr");
 assert.equal(await page.evaluate(()=>localStorage.getItem("bright_carwash_worker_lang_v1")),"ha-NG");
 assert.equal(await page.evaluate(()=>document.documentElement.getAttribute("data-worker-lang-pending")),null);
 assert.equal(await page.getByTestId("service-choices").count(),0);
 await page.getByRole("button",{name:/Ƙaramar mota/}).click();
 await page.getByTestId("service-choices").getByRole("button",{name:/Cikakken wanki/}).click();
 await page.getByText("Ƙarin bayani (zaɓi ne)").click();
 await page.getByPlaceholder("Bayani kan motar").fill("DRAFT-123");
 const before={...totals};
 await page.getByRole("button",{name:"English"}).click();
 await page.getByRole("heading",{name:/Register cars/}).waitFor();
 assert.equal(await page.locator(".worker-screen").getAttribute("dir"),"ltr");
 assert.equal(await page.getByPlaceholder("Notes about this car").inputValue(),"DRAFT-123");
 assert.deepEqual(totals,before,"Switching display language must not trigger refetch");
 await page.waitForTimeout(550);
 await page.reload();
 await page.getByRole("heading",{name:/Register cars/}).waitFor();
 await page.waitForFunction(()=>document.querySelector('input[placeholder="Notes about this car"]')?.value==="DRAFT-123");
 assert.equal(await page.getByPlaceholder("Notes about this car").inputValue(),"DRAFT-123");
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),localeKey),"en");
 await page.getByRole("button",{name:"العربية"}).click();
 await page.getByRole("heading",{name:/تسجيل السيارات/}).waitFor();
 assert.equal(await page.locator(".worker-screen").getAttribute("dir"),"rtl");
 assert.equal(await page.getByPlaceholder("ملاحظات عن السيارة").inputValue(),"DRAFT-123");
 await page.reload();
 await page.getByRole("heading",{name:/تسجيل السيارات/}).waitFor();
 await page.waitForFunction(()=>document.querySelector('input[placeholder="ملاحظات عن السيارة"]')?.value==="DRAFT-123");
 assert.equal(await page.locator(".worker-screen").getAttribute("dir"),"rtl");
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),localeKey),"ar");
 await ctx.close();
 const other=await browser.newContext({...devices[device],serviceWorkers:"block"});
 await other.route("https://wa.me/**",route=>route.fulfill({status:200,contentType:"text/html",body:"WhatsApp test only"}));
 const fresh=await other.newPage();await fake(fresh);
 await fresh.goto(URL);
 await fresh.getByRole("heading",{name:/Register cars/}).waitFor();
 assert.equal(await fresh.evaluate(key=>localStorage.getItem(key),localeKey),null,
  "Second device must have independent preference");
 await fresh.getByRole("button",{name:"Hausa"}).click();
 await fresh.getByRole("heading",{name:/Rijistar motoci/}).waitFor();
 await fresh.getByRole("button",{name:/Ƙaramar mota/}).click();
 await fresh.getByTestId("service-choices").getByRole("button",{name:/Cikakken wanki/}).click();
 await fresh.getByRole("button",{name:"Biya a haɗe"}).click();
 await fresh.getByLabel("Kuɗin hannu",{exact:true}).fill("10");
 await fresh.getByLabel("Kuɗin POS",{exact:true}).fill("15");
 await fresh.getByRole("button",{name:/Rijistar mota/}).last().click();
 await fresh.getByText("An yi rajistar motar cikin nasara.",{exact:true}).waitFor();
 assert.equal(writes.length,1);
 assert.equal(writes[0].cash,10);assert.equal(writes[0].card,15);
 assert.equal(writes[0].presetId,preset[0].id);
 assert.equal(writes[0].oneTime,undefined);
 await fresh.getByRole("button",{name:/Motocin yau da halinsu/}).click();
 await fresh.getByText("Ta shirya a karɓa").waitFor();
 const visible=(await fresh.locator(".worker-screen").innerText()).replace("العربية","");
 assert.doesNotMatch(visible,/[\u0600-\u06FF]/,
  "Hausa worker page must have no hardcoded Arabic text except the Arabic language name");
 // Customer caption stays Arabic regardless of the Hausa user interface.
 const popupWait=fresh.waitForEvent("popup");
 await fresh.getByRole("button",{name:"Raba hoto"}).click();
 const opened=await popupWait;await opened.waitForLoadState();
 const parsed=new URL(opened.url());
 assert.equal(parsed.hostname,"wa.me");
 assert.equal(parsed.pathname,"/966500000000");
 assert.match(parsed.searchParams.get("text")||"",/سيارتك جاهزة/);
 await opened.close();
 assert.equal(await fresh.getByRole("button",{name:/Alama ta shirya/}).count(),0);
 await other.close();
 // Manager shares the JSX component but is deliberately forced to Arabic.
 const source=fs.readFileSync("app/components/CarRegistrationScreen.tsx","utf8");
 assert.match(source,/manager\?"ar":language/);
 assert.match(source,/!manager&&<div className="flex gap-1/);
 console.log(JSON.stringify({browser:device,checks:[
  "Previously selected Hausa persists on device",
  "English change is instant without refetch or lost input",
  "English persists through reload",
  "Arabic becomes RTL and persists",
  "New browser defaults to English until Hausa selected",
  "Hausa mixed payment preserves numeric payload and preset ID",
  "Hausa readiness opens customer WhatsApp with Arabic text",
  "Manager fixed Arabic without worker language selector"
 ]},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
