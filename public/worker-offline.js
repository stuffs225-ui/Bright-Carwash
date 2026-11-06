/* Generic offline worker shell. This file contains no token and is safe to cache. */
"use strict";
(async()=>{
 const DB="bright-carwash-worker-encrypted-outbox-v1";
 const $=id=>document.getElementById(id);
 const token=location.pathname.match(/^\\/w\\/([a-f0-9]{64})$/)?.[1]||"";
 const notify=(msg,err=false)=>{(err?$("error"):$("status")).textContent=msg;};
 const reqResult=req=>new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 const txDone=tx=>new Promise((resolve,reject)=>{
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 const openDb=()=>new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains("keys"))db.createObjectStore("keys",{keyPath:"id"});
   if(!db.objectStoreNames.contains("records"))db.createObjectStore("records",{keyPath:"id"});
   if(!db.objectStoreNames.contains("catalogs"))db.createObjectStore("catalogs",{keyPath:"hash"});
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 if(!token||!crypto.subtle||typeof indexedDB==="undefined"){
  notify("لا يمكن تشغيل النسخة المحلية بصورة آمنة. افتح رابط العامل الأصلي عند توفر الإنترنت.",true);
  return;
 }
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))))
  .map(x=>x.toString(16).padStart(2,"0")).join("");
 let db=null;
 try{db=await openDb();}catch{notify("المتصفح لا يدعم التخزين المشفر المطلوب.",true);return;}
 const catalogRow=await reqResult(db.transaction("catalogs","readonly").objectStore("catalogs").get(hash)).catch(()=>null);
 if(!catalogRow||Date.now()-catalogRow.savedAt>14*86400000){
  notify("لا يوجد كتالوج محفوظ لهذا الرابط. افتح صفحة العامل مرة واحدة بالإنترنت لتجهيزها.",true);
  return;
 }
 const catalog=catalogRow.catalog;
 if(!catalog.presets?.length){notify("لا توجد خدمات محفوظة، افتح الرابط بالإنترنت.",true);return;}
 let method="cash",discountEnabled=false;
 const money=n=>new Intl.NumberFormat("ar-SA",{maximumFractionDigits:2}).format(n)+" ر.س";
 const price=()=>Math.round(((catalog.presets.find(p=>p.id===$("preset").value)?.amount||0)+
  catalog.addons.filter(a=>document.querySelector('[data-addon="'+a.id+'"]')?.checked)
   .reduce((sum,a)=>sum+Number(a.price),0)-(discountEnabled?Number($("discount").value)||0:0))*100)/100;
 const update=()=>{
  const total=price();$("total").textContent=money(Math.max(total,0));
  if(method==="cash"){$("cash").value=String(total);$("card").value="0";}
  else if(method==="card"){$("cash").value="0";$("card").value=String(total);}
  else{const half=Math.round(total*50)/100;$("cash").value=String(half);$("card").value=String(Math.round((total-half)*100)/100);}
 };
 for(const p of catalog.presets){
  const opt=document.createElement("option");opt.value=p.id;
  opt.textContent=p.car_type+" — "+p.service_type+" ("+money(Number(p.amount))+")";$("preset").append(opt);
 }
 $("addons").textContent="";
 for(const a of catalog.addons||[]){
  const label=document.createElement("label"),box=document.createElement("input");
  box.type="checkbox";box.dataset.addon=a.id;box.addEventListener("change",update);
  label.append(box,document.createTextNode(" "+a.name+" — "+money(Number(a.price))));$("addons").append(label);
 }
 $("preset").addEventListener("change",update);
 $("discount").addEventListener("input",update);
 $("discount-toggle").addEventListener("click",()=>{
  discountEnabled=!discountEnabled;$("discount-area").hidden=!discountEnabled;
  $("discount-toggle").setAttribute("aria-pressed",String(discountEnabled));
  if(!discountEnabled)$("discount").value="0";update();
 });
 for(const b of $("payment-method").querySelectorAll("button")){
  b.addEventListener("click",()=>{
   method=b.dataset.method;$("mixed").hidden=method!=="mixed";
   for(const c of $("payment-method").querySelectorAll("button"))
    c.setAttribute("aria-pressed",String(c===b));
   update();
  });
 }
 const refresh=async()=>{
  const rows=await reqResult(db.transaction("records","readonly").objectStore("records").getAll());
  $("count").textContent="عمليات بانتظار المزامنة في هذا الجهاز: "+rows.filter(x=>x.linkHash===hash).length;
 };
 async function deviceKey(){
  const candidate=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  const tx=db.transaction("keys","readwrite"),done=txDone(tx);
  const row=await reqResult(tx.objectStore("keys").get("device"));
  if(!row)tx.objectStore("keys").put({id:"device",key:candidate});
  await done;return row?.key||candidate;
 }
 $("reconnect").addEventListener("click",()=>{if(navigator.onLine)location.reload();
  else notify("لم تعد الشبكة بعد. البيانات المحفوظة ستبقى حتى تتم المزامنة.");});
 window.addEventListener("online",()=>notify("عادت الشبكة. اضغط زر المزامنة لتحويلك لصفحة التسجيل والتحقق من العمليات."));
 $("form").addEventListener("submit",async e=>{
  e.preventDefault();$("error").textContent="";$("status").textContent="";
  const discount=discountEnabled?Number($("discount").value):0;
  const cash=Number($("cash").value),card=Number($("card").value);
  if(!Number.isFinite(discount)||discount<0||discount>10||
   !Number.isFinite(cash)||!Number.isFinite(card)||cash<0||card<0||
   Math.round((cash+card)*100)!==Math.round(price()*100)||price()<=0){
   notify("تحقق من السعر ومبالغ الكاش والشبكة والخصم.",true);return;
  }
  let phone=$("phone").value.trim().replace(/[\\s-]/g,"");
  if(/^05[0-9]{8}$/.test(phone))phone="+966"+phone.slice(1);
  if(phone&&!/^\\+9665[0-9]{8}$/.test(phone)){notify("رقم الجوال غير صحيح.",true);return;}
  if(phone&&!$("consent").checked){notify("يلزم موافقة العميل لاستخدام الجوال، أو اتركه فارغًا.",true);return;}
  const payload={presetId:$("preset").value,addons:Array.from($("addons").querySelectorAll("input:checked"))
    .map(x=>x.dataset.addon),cash,card,discount,notes:$("notes").value.trim(),
   customerPhone:phone||null,whatsappConsent:!!phone&&$("consent").checked,mutationId:crypto.randomUUID()};
  $("save").disabled=true;
  try{
   const rows=await reqResult(db.transaction("records","readonly").objectStore("records").getAll());
   if(rows.length>=100)throw Error("الحد الأقصى 100 عملية معلقة. أعد الاتصال للمزامنة.");
   const key=await deviceKey(),iv=crypto.getRandomValues(new Uint8Array(12));
   const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,
    new TextEncoder().encode(JSON.stringify(payload))));
   const tx=db.transaction("records","readwrite"),done=txDone(tx);
   tx.objectStore("records").add({id:payload.mutationId,linkHash:hash,createdAt:new Date().toISOString(),
    iv:Array.from(iv),cipher:Array.from(cipher)});
   await done;
   $("notes").value="";$("phone").value="";$("consent").checked=false;
   discountEnabled=false;$("discount").value="0";$("discount-area").hidden=true;
   $("discount-toggle").setAttribute("aria-pressed","false");update();
   await refresh();
   notify("تم حفظ السيارة مشفرة على هذا الجهاز. لم تصل إلى السيرفر بعد. اضغط المزامنة عند رجوع الإنترنت.");
  }catch(err){notify("تعذر الحفظ الآمن. لم تُحفظ العملية: "+(err?.message||"خطأ تخزين"),true);}
  finally{$("save").disabled=false;}
 });
 $("form").hidden=false;update();await refresh();
 notify("تعمل هذه الصفحة دون شبكة باستخدام آخر قائمة أسعار محفوظة. لا يُعتبر التسجيل نهائيًا إلا بعد المزامنة.");
})();
