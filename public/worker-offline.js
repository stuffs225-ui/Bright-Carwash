/* Generic, token-free offline shell. Uses the SAME /locales/*.json files
 * as the online registration UI. Never persists a shared worker token. */
"use strict";
(async()=>{
 const DB="bright-carwash-worker-encrypted-outbox-v1";
 const $=id=>document.getElementById(id);
 const token=location.pathname.match(/^\/w\/([a-f0-9]{64})$/)?.[1]||"";
 let offlineManager=null;
 try{offlineManager=JSON.parse(localStorage.getItem("bright_carwash_manager_offline_id_v1")||"null");}
 catch{}
 const managerValid=location.pathname==="/" && offlineManager &&
  /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(offlineManager.userId) &&
  Date.now()-Number(offlineManager.verifiedAt)>=0 &&
  Date.now()-Number(offlineManager.verifiedAt)<14*86400000;
 const managerNamespace=managerValid?offlineManager.userId.toLowerCase().replace(/-/g,"").padEnd(64,"0"):"";
 const namespace=token||managerNamespace;
 const workerMode=!!token;
 const supported=["ha-NG","en","ar"];
 const LOCALE_KEY="bright_carwash_worker_lang_v1";
 let lang="ha-NG";
 try{lang=workerMode?localStorage.getItem(LOCALE_KEY)||"":"ar";}catch{}
 if(workerMode&&!supported.includes(lang)){
  try{lang=document.cookie.match(/(?:^|; )carwash_worker_lang=(ha-NG|en|ar)(?:;|$)/)?.[1]||"ha-NG";}catch{lang="ha-NG";}
 }
 if(!supported.includes(lang))lang=workerMode?"ha-NG":"ar";
 const localeFiles=new Map(),ui={};
 let strings={},lastNotice=null,hash="",db=null,catalog=null;
 let method="cash",discountEnabled=false,carType="",manualMode=false;
 let discountLimit=10;
 const carKeys={"سيارة صغيرة":"car.small","سيارة كبيرة":"car.large","شاحنة":"car.truck",
  "باص صغير":"car.smallBus","باص كبير":"car.largeBus","سيدان":"car.sedan","SUV":"car.suv"};
 const serviceKeys={"غسيل كامل":"service.full","غسيل خارجي":"service.exterior","غسيل بستم":"service.piston"};
 const addonKeys={"تعطير":"addon.perfume","واكس":"addon.wax","تنظيف إضافي":"addon.clean"};
 const t=(key,vars={})=>(strings[key]||key).replace(/\{(\w+)\}/g,(_,k)=>String(vars[k]??""));
 const text=(map,key,fallback)=>map[key]?t(map[key]):lang==="ar"?key:t(fallback);
 const money=n=>new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})
  .format(Number(n)||0)+(workerMode?" SAR":" ر.س");
 const notify=(key,error=false,vars={})=>{
  lastNotice={key,error,vars};
  const status=$("status"),err=$("error");
  if(status)status.textContent=error?"":t(key,vars);
  if(err)err.textContent=error?t(key,vars):"";
 };
 function redrawLabels(){
  document.documentElement.lang=lang;
  document.documentElement.dir=lang==="ar"?"rtl":"ltr";
  for(const el of document.querySelectorAll("[data-i18n]")){
   const key=el.getAttribute("data-i18n");
   if(key==="offline.discountMaximum")el.textContent=t(key,{n:discountLimit});
   else el.textContent=t(key);
  }
  for(const el of document.querySelectorAll("[data-i18n-placeholder]"))
   el.placeholder=t(el.getAttribute("data-i18n-placeholder"));
  for(const btn of document.querySelectorAll("[data-locale]"))
   btn.setAttribute("aria-pressed",String(btn.getAttribute("data-locale")===lang));
  if($("discount-toggle"))$("discount-toggle").textContent=t(discountEnabled?"reg.discountCancel":"reg.discountAdd");
  if(lastNotice)notify(lastNotice.key,lastNotice.error,lastNotice.vars);
  drawPresets();drawAddons();update();
  if($("count"))void refresh().catch(()=>{});
 }
 async function changeLang(next,save=true){
  if(!workerMode)next="ar";
  if(!supported.includes(next))next="ha-NG";
  if(!localeFiles.has(next)){
   const res=await fetch("/locales/"+next+".json",{cache:"force-cache"});
   if(!res.ok)throw Error("Locale unavailable");
   localeFiles.set(next,await res.json());
  }
  lang=next;strings=localeFiles.get(next);
  if(workerMode&&save){try{localStorage.setItem(LOCALE_KEY,lang);}catch{}
   try{document.cookie="carwash_worker_lang="+lang+"; Path=/w; Max-Age=31536000; SameSite=Lax";}catch{}
  }
  redrawLabels();
  document.documentElement.removeAttribute("data-worker-locale-pending");
 }
 for(const btn of document.querySelectorAll("[data-locale]"))
  btn.addEventListener("click",()=>{void changeLang(btn.dataset.locale).catch(()=>notify("error.generic",true));});
 try{await changeLang(lang,false);}catch{
  // A damaged locale cache must not block secure queue recovery.
  try{await changeLang(workerMode?"ha-NG":"ar",false);}catch{}
  document.documentElement.removeAttribute("data-worker-locale-pending");
 }
 const reqResult=req=>new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 const txDone=tx=>new Promise((resolve,reject)=>{
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 const openDb=()=>new Promise((resolve,reject)=>{
  // Version 2 is shared with lib/workerOfflineQueue.ts, including encrypted drafts.
  const req=indexedDB.open(DB,2);
  req.onupgradeneeded=()=>{
   const d=req.result;
   if(!d.objectStoreNames.contains("keys"))d.createObjectStore("keys",{keyPath:"id"});
   if(!d.objectStoreNames.contains("records"))d.createObjectStore("records",{keyPath:"id"});
   if(!d.objectStoreNames.contains("catalogs"))d.createObjectStore("catalogs",{keyPath:"hash"});
   if(!d.objectStoreNames.contains("drafts"))d.createObjectStore("drafts",{keyPath:"hash"});
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 if(!namespace||!crypto.subtle||typeof indexedDB==="undefined"){
  notify("offline.access",true);return;
 }
 hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(namespace))))
  .map(n=>n.toString(16).padStart(2,"0")).join("");
 try{db=await openDb();}catch{notify("offline.browser",true);return;}
 const row=await reqResult(db.transaction("catalogs","readonly").objectStore("catalogs").get(hash)).catch(()=>null);
 if(!row||Date.now()-row.savedAt>14*86400000){notify("offline.none",true);return;}
 catalog=row.catalog;
 discountLimit=Number.isFinite(Number(catalog.discountLimit))?
  Math.max(0,Math.min(1000,Number(catalog.discountLimit))):10;
 $("discount").max=String(discountLimit);
 const presets=catalog.presets||[],addons=catalog.addons||[];
 if(!presets.length){notify("offline.none",true);return;}
 const selectedPreset=()=>presets.find(p=>p.id===$("preset").value);
 const available=()=>workerMode?presets.filter(p=>p.car_type===carType):presets;
 const allServices=[...new Set(presets.map(p=>p.service_type))];
 function drawPresets(){
  if(!catalog)return;
  const list=available(),select=$("preset"),prev=select.value;
  select.replaceChildren();
  for(const p of list){
   const opt=document.createElement("option");opt.value=p.id;
   opt.textContent=text(carKeys,p.car_type,"service.custom")+" — "+
    text(serviceKeys,p.service_type,"service.custom")+" ("+money(p.amount)+")";
   select.append(opt);
  }
  if(list.some(p=>p.id===prev))select.value=prev;
  select.required=list.length>0&&!manualMode;
  select.disabled=list.length===0;
  const manual=$("manual-service");
  if(manual){
   const old=manual.value;manual.replaceChildren();
   for(const service of allServices){
    const opt=document.createElement("option");opt.value=service;
    opt.textContent=text(serviceKeys,service,"service.custom");manual.append(opt);
   }
   if(allServices.includes(old))manual.value=old;
   else if(selectedPreset())manual.value=selectedPreset().service_type;
  }
 }
 function drawAddons(){
  if(!catalog)return;
  const parent=$("addons");
  const chosen=new Set([...parent.querySelectorAll("[data-addon]:checked")].map(x=>x.dataset.addon));
  parent.replaceChildren();
  for(const a of addons){
   const label=document.createElement("label"),box=document.createElement("input");
   box.type="checkbox";box.dataset.addon=a.id;box.checked=chosen.has(a.id);
   box.addEventListener("change",update);
   label.append(box,document.createTextNode(" "+text(addonKeys,a.name,"addon.other")+" — "+money(a.price)));
   parent.append(label);
  }
 }
 const discount=()=>discountEnabled?Number($("discount").value)||0:0;
 const manualPrice=()=>Number($("manual-price")?.value||0);
 const price=()=>{
  const base=manualMode?manualPrice():Number(selectedPreset()?.amount||0);
  const extra=addons.filter(a=>document.querySelector('[data-addon="'+a.id+'"]')?.checked)
    .reduce((sum,a)=>sum+Number(a.price),0);
  return Math.round((base+extra-discount())*100)/100;
 };
 function update(){
  if(!catalog)return;
  const total=price();
  $("total").textContent=money(Math.max(0,total));
  if(method==="cash"){$("cash").value=String(total);$("card").value="0";}
  else if(method==="card"){$("cash").value="0";$("card").value=String(total);}
  else{const half=Math.round(total*50)/100;$("cash").value=String(half);
   $("card").value=String(Math.round((total-half)*100)/100);}
 }
 function setManual(active){
  manualMode=active;
  const box=$("manual-box"),toggle=$("manual-toggle");
  if(box)box.hidden=!active;
  if(toggle){toggle.hidden=!workerMode||(!selectedPreset()&&active);
   toggle.textContent=t(active?"reg.official":"reg.manual");}
  if($("manual-price")&&active&&selectedPreset())
   $("manual-price").value=String(selectedPreset().amount);
  if($("manual-price")&&!active)$("manual-price").value="";
  if($("manual-service")&&selectedPreset())$("manual-service").value=selectedPreset().service_type;
  $("preset").required=!active;
  update();
 }
 function chooseType(type){
  carType=type;
  for(const btn of document.querySelectorAll("[data-car]"))
   btn.setAttribute("aria-pressed",String(btn.dataset.car===type));
  $("service-panel").hidden=!type;
  manualMode=false;
  drawPresets();
  const noOfficial=available().length===0;
  setManual(noOfficial);
  if(noOfficial&&catalog.manualServiceEnabled===false){
   $("save").disabled=true;notify("error.customDisabled",true);
  }else{$("save").disabled=false;notify("offline.queueSafe");}
 }
 for(const button of document.querySelectorAll("[data-car]"))
  button.addEventListener("click",()=>chooseType(button.dataset.car));
 if(!workerMode)$("service-panel")?.removeAttribute("hidden");
 if($("manual-toggle"))$("manual-toggle").addEventListener("click",()=>{
  if(catalog.manualServiceEnabled===false)return notify("error.customDisabled",true);
  setManual(!manualMode);
 });
 $("preset").addEventListener("change",()=>{
  if($("manual-service")&&selectedPreset())$("manual-service").value=selectedPreset().service_type;
  if(manualMode&&$("manual-price")&&selectedPreset())
   $("manual-price").value=String(selectedPreset().amount);
  update();
 });
 if($("manual-price"))$("manual-price").addEventListener("input",update);
 $("discount").addEventListener("input",update);
 $("discount-toggle").addEventListener("click",()=>{
  discountEnabled=!discountEnabled;$("discount-area").hidden=!discountEnabled;
  $("discount-toggle").setAttribute("aria-pressed",String(discountEnabled));
  $("discount-toggle").textContent=t(discountEnabled?"reg.discountCancel":"reg.discountAdd");
  if(!discountEnabled)$("discount").value="0";update();
 });
 for(const button of $("payment-method").querySelectorAll("button")){
  button.addEventListener("click",()=>{
   method=button.dataset.method;
   $("mixed").hidden=method!=="mixed";
   for(const item of $("payment-method").querySelectorAll("button"))
    item.setAttribute("aria-pressed",String(item===button));
   update();
  });
 }
 async function refresh(){
  if(!db||!hash)return;
  const rows=await reqResult(db.transaction("records","readonly").objectStore("records").getAll());
  $("count").textContent=t("offline.pending",{n:rows.filter(x=>x.linkHash===hash).length});
 }
 async function deviceKey(){
  const candidate=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  const tx=db.transaction("keys","readwrite"),done=txDone(tx);
  const row=await reqResult(tx.objectStore("keys").get("device"));
  if(!row)tx.objectStore("keys").put({id:"device",key:candidate});
  await done;return row?.key||candidate;
 }
 $("reconnect").addEventListener("click",()=>{
  if(navigator.onLine)location.reload();
  else notify("offline.noNet");
 });
 window.addEventListener("online",()=>notify("offline.online"));
 $("form").addEventListener("submit",async event=>{
  event.preventDefault();
  const base=manualMode?manualPrice():Number(selectedPreset()?.amount||0);
  const net=price(),cash=Number($("cash").value),card=Number($("card").value);
  const discountValue=discount();
  if(workerMode&&!carType){notify("offline.noService",true);return;}
  if(manualMode&&catalog.manualServiceEnabled===false){notify("error.customDisabled",true);return;}
  if(manualMode&&(!Number.isFinite(base)||base<=0||base>5000||!$("manual-service")?.value)){
   notify("error.servicePrice",true);return;
  }
  if((!manualMode&&!selectedPreset())||!Number.isFinite(net)||net<=0||
   ![cash,card,discountValue].every(Number.isFinite)||cash<0||card<0||
   discountValue<0||discountValue>discountLimit||
   Math.round((cash+card)*100)!==Math.round(net*100)){
   notify("offline.invalid",true);return;
  }
  let phone=$("phone").value.trim().replace(/[\s-]/g,"");
  if(/^05[0-9]{8}$/.test(phone))phone="+966"+phone.slice(1);
  if(phone&&!/^\+9665[0-9]{8}$/.test(phone)){notify("error.phone",true);return;}
  // The old manager offline form has consent; the worker form uses the already
  // approved phone-as-notification choice from online registration.
  if(phone&&$("consent")&&!$("consent").checked){notify("error.phone",true);return;}
  const addonsSelected=Array.from($("addons").querySelectorAll("input:checked")).map(x=>x.dataset.addon);
  const payload={
   presetId:manualMode?"":$("preset").value,
   addons:addonsSelected,cash,card,discount:discountValue,notes:$("notes").value.trim(),
   customerPhone:phone||null,whatsappConsent:!!phone,
   mutationId:crypto.randomUUID(),recordedAt:new Date().toISOString(),
   ...(manualMode?{oneTime:{enabled:true,carType,service:$("manual-service").value,
    price:Math.round(base*100)/100,addons:[],reason:"Manual price entered offline"}}:{})
  };
  $("save").disabled=true;
  try{
   const rows=await reqResult(db.transaction("records","readonly").objectStore("records").getAll());
   if(rows.length>=100)throw Error("Queue full");
   const key=await deviceKey(),iv=crypto.getRandomValues(new Uint8Array(12));
   const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,
    new TextEncoder().encode(JSON.stringify(payload))));
   const tx=db.transaction("records","readwrite"),done=txDone(tx);
   tx.objectStore("records").add({id:payload.mutationId,linkHash:hash,createdAt:new Date().toISOString(),
    iv:Array.from(iv),cipher:Array.from(cipher)});
   await done;
   $("notes").value="";$("phone").value="";
   if($("consent"))$("consent").checked=false;
   discountEnabled=false;$("discount").value="0";$("discount-area").hidden=true;
   $("discount-toggle").setAttribute("aria-pressed","false");
   $("discount-toggle").textContent=t("reg.discountAdd");
   if(workerMode){carType="";$("service-panel").hidden=true;
    for(const btn of document.querySelectorAll("[data-car]"))btn.setAttribute("aria-pressed","false");}
   setManual(false);update();
   await refresh();notify("offline.saved");
  }catch(err){notify(err?.message==="Queue full"?"offline.limit":"offline.failure",true);}
  finally{$("save").disabled=false;}
 });
 $("form").hidden=false;drawPresets();drawAddons();update();await refresh();
 if(workerMode)notify("offline.queueSafe");
})().catch(()=>{
 document.documentElement.removeAttribute("data-worker-locale-pending");
 const err=document.getElementById("error");
 if(err)err.textContent="Unable to load offline registration. Reopen the worker link online.";
});
