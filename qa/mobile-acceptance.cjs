// Local browser regression with synthetic API fixtures; never targets production.
const {chromium,webkit,devices}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const engine=process.env.BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch({headless:true});
 const context=await browser.newContext({...devices['iPhone 13'],serviceWorkers:'block'});
 await context.addInitScript(()=>{
  Object.defineProperty(navigator,"canShare",{configurable:true,value:p=>p.files?.length===1});
  Object.defineProperty(navigator,"share",{configurable:true,value:async p=>{
   window.__share={name:p.files[0].name,mime:p.files[0].type,caption:p.text,size:p.files[0].size};
  }});
 });
 // Legacy cash/offline test intentionally runs in Arabic; a separate fixture
 // verifies that untouched devices start in Hausa and remembers last choice.
 await context.addInitScript(()=>localStorage.setItem('bright_carwash_worker_lang_v1','ar'));
 const page=await context.newPage();
 const recorded=new Map();let writes=0;const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date());
 const preset={id:'11111111-1111-4111-8111-111111111111',car_type:'سيارة صغيرة',service_type:'غسيل كامل',amount:25};
 const car={id:'22222222-2222-4222-8222-222222222222',carType:'سيارة صغيرة',serviceType:'غسيل كامل',date:today,occurredAt:new Date().toISOString(),cash:25,card:0,discount:0,phone:'+966500000000',consent:true,status:'washing',photoAvailable:false};
 await page.route('**/api/worker-links/**',async route=>{
  const url=route.request().url(),body=route.request().postDataJSON();let json={};
  if(url.endsWith('/catalog'))json={label:'اختبار اصطناعي',presets:[preset],addons:[],discountLimit:10,manualServiceEnabled:true};
  else if(url.endsWith('/summary'))json={days:[{date:today,status:'open',cars:recorded.size,cash:25*recorded.size,card:0,crew:10*recorded.size}],today};
  else if(url.endsWith('/record')){writes++;recorded.set(body.mutationId,body);json={ok:true,id:body.mutationId};}
  else if(url.endsWith('/active')){
   if(body.op==='share_opened')car.status='ready';
   if(body.op==='delivered')car.status='delivered';
   json=body.op==='list'?{cars:[car],readyMessage:'سيارتك جاهزة للاستلام'}:{ok:true};
  }
  await route.fulfill({json});
 });
 const checks=[];
 await page.goto('http://localhost:3000/w/'+'a'.repeat(64));
 await page.getByRole('button',{name:'تسجيل السيارة',exact:true}).waitFor();
 assert.equal(await page.getByTestId('service-choices').count(),0,'Service menu stays hidden before car type selection');
 await page.getByRole('button',{name:'شاحنة'}).click();
 await page.getByTestId('service-choices').getByRole('button',{name:'غسيل كامل',exact:true}).click();
 assert.equal(await page.getByLabel(/السعر لهذه السيارة/).inputValue(),'');
 await page.getByLabel(/السعر لهذه السيارة/).fill('55');
 await page.getByRole('button',{name:'سيارة صغيرة'}).click();
 await page.getByTestId('service-choices').getByRole('button',{name:/غسيل كامل/}).first().click();
 const dayDetails=page.getByTestId('worker-day').first();
 await dayDetails.waitFor({state:'attached'});
 assert.equal(await page.locator('details[open]').count(),0,'All collapsible sections must start closed');
 await dayDetails.locator('summary').click();
 assert.equal(await dayDetails.evaluate(el=>el.open),true,'Tapping a day opens it');
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await page.waitForTimeout(300);
 assert.equal(await dayDetails.evaluate(el=>el.open),true,'Live summary refresh must preserve manual toggle');
 await dayDetails.locator('summary').click();
 assert.equal(await dayDetails.evaluate(el=>el.open),false,'Tapping again closes the day');
 checks.push('Shared manager and worker day accordions start closed and respect manual toggles');
 assert.equal(await page.getByText('إضافة خاصة لمرة واحدة').count(),0);
 assert.equal(await page.getByText('وافق العميل على استخدام رقمه').count(),0);checks.push('Removed fields absent');
 await page.getByText('معلومات إضافية (اختيارية)').click();
 await page.getByPlaceholder('ملاحظات عن السيارة').fill('مسودة اختبار تحديث الصفحة');
 await page.getByPlaceholder('05XXXXXXXX').fill('0500000000');
 await page.waitForTimeout(700);
 await page.reload();
 await page.getByRole('button',{name:'تسجيل السيارة',exact:true}).waitFor();
 await page.getByTestId('worker-day').first().waitFor({state:'attached'});
 assert.equal(await page.locator('details[open]').count(),0,'Accordions must reset closed after reload');
 await page.waitForFunction(()=>document.querySelector('input[placeholder="ملاحظات عن السيارة"]')?.value==='مسودة اختبار تحديث الصفحة');
 assert.equal(await page.getByPlaceholder('ملاحظات عن السيارة').inputValue(),'مسودة اختبار تحديث الصفحة');
 assert.equal(await page.getByPlaceholder('05XXXXXXXX').inputValue(),'0500000000');
 checks.push('Encrypted unsaved draft survives reload');
 await page.getByRole('button',{name:'مختلط',exact:true}).click();
 await page.getByLabel('المبلغ كاش',{exact:true}).fill('10');
 await page.getByLabel('المبلغ شبكة',{exact:true}).fill('10');
 assert.equal(await page.locator('input[aria-invalid="true"]').count(),2);
 await page.getByRole('button',{name:'تسجيل السيارة',exact:true}).click();assert.equal(writes,0);checks.push('Mixed mismatch highlighted and rejected');
 await page.getByLabel('المبلغ شبكة',{exact:true}).fill('15');
 await page.getByRole('button',{name:'تسجيل السيارة',exact:true}).click();
 await page.getByText('تم تسجيل السيارة بنجاح.',{exact:true}).waitFor();assert.equal(recorded.size,1);checks.push('Mixed payment saved once');
 await context.setOffline(true);
 await page.getByRole('button',{name:'كاش',exact:true}).click();
 await page.getByRole('button',{name:'سيارة صغيرة'}).click();
 await page.getByTestId('service-choices').getByRole('button',{name:/غسيل كامل/}).first().click();
 await page.getByRole('button',{name:'تسجيل السيارة',exact:true}).click();
 await page.getByText('عمليات بانتظار المزامنة: 1',{exact:true}).waitFor();assert.equal(recorded.size,1);checks.push('Offline write stored without server revenue');
 await context.setOffline(false);
 await page.getByText('تم تسجيل السيارة بنجاح.',{exact:true}).waitFor();assert.equal(recorded.size,2);assert.equal(writes,2);
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.waitForTimeout(300);assert.equal(writes,2);checks.push('Reconnect and repeated online event do not duplicate');
 await page.getByRole('button',{name:/سيارات اليوم وحالة الجاهزية/}).click();
 const actions=page.getByTestId('direct-ready-actions');
 await actions.waitFor();
 assert.equal(await actions.getByRole('button').count(),2,'Only Share and Delivered are direct options');
 assert.equal(await page.getByRole('button',{name:/إبلاغ بالجاهزية/}).count(),0);
 assert.equal(await page.getByRole('button',{name:/إضافة خصم/}).count(),0);
 await actions.getByRole('button',{name:'مشاركة',exact:true}).click();
 await page.waitForFunction(()=>Boolean(window.__share));
 const shared=await page.evaluate(()=>window.__share);
 assert.equal(shared.mime,'image/jpeg');assert.ok(shared.size>5000);
 assert.match(shared.caption,/سيارتك جاهزة/);
 checks.push('Share uses a prepared actual JPEG and Arabic caption, never text-only wa.me');
 const dialogs=[];page.on('dialog',d=>{dialogs.push(d.type());void d.dismiss()});
 await actions.getByRole('button',{name:'تم التسليم',exact:true}).click();
 await page.getByText('تم توثيق التسليم.',{exact:true}).waitFor();
 assert.deepEqual(dialogs,[],'Delivery must not trigger a confirmation popup');
 assert.equal(await page.getByTestId('direct-ready-actions').count(),0);
 checks.push('Delivered directly from the ready list with no confirmation dialog');
 console.log(JSON.stringify({browser:(process.env.BROWSER||'chromium')+' iPhone 13 emulation',checks,uniqueOperations:recorded.size,recordRequests:writes},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
