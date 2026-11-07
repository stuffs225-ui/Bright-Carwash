// Per-device encrypted IndexedDB outbox for the shared worker-link workflow.
// Never persist the raw bearer URL or worker capability token.
export type WorkerSubmission={
 presetId:string;addons:string[];cash:number;card:number;discount:number;
 notes:string;customerPhone:string|null;whatsappConsent:boolean;mutationId:string;recordedAt?:string;
 oneTime?:{enabled:true;carType:string;service:string;price:number;addons:{name:string;price:number}[];reason:string};
};
export type WorkerCatalog={
 label:string;
 presets:Array<{id:string;car_type:string;service_type:string;amount:number}>;
 addons:Array<{id:string;name:string;price:number}>;
 discountLimit?:number;manualServiceEnabled?:boolean;manualAddonEnabled?:boolean;
};
export type QueuedWorkerRecord={id:string;payload:WorkerSubmission;createdAt:string};
type Stored={id:string;linkHash:string;iv:number[];cipher:number[];createdAt:string};
const DATABASE="bright-carwash-worker-encrypted-outbox-v1";
const LIMIT=100;

function result<T>(request:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("IndexedDB error"));
 });
}
function complete(tx:IDBTransaction):Promise<void>{
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||Error("IndexedDB transaction error"));
  tx.onabort=()=>reject(tx.error||Error("IndexedDB transaction aborted"));
 });
}
function open():Promise<IDBDatabase>{
 if(typeof indexedDB==="undefined"||typeof crypto==="undefined"||!crypto.subtle)
  return Promise.reject(Error("Secure local storage unavailable"));
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>{
   const db=request.result;
   db.createObjectStore("keys",{keyPath:"id"});
   db.createObjectStore("records",{keyPath:"id"});
   db.createObjectStore("catalogs",{keyPath:"hash"});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("Unable to open encrypted outbox"));
 });
}
async function fingerprint(token:string):Promise<string>{
 if(!/^[a-f0-9]{64}$/.test(token))throw Error("Invalid worker link");
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 return Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");
}
async function deviceKey(db:IDBDatabase):Promise<CryptoKey>{
 const candidate=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const tx=db.transaction("keys","readwrite");
 const done=complete(tx);
 const store=tx.objectStore("keys");
 const row=await result(store.get("device") as IDBRequest<{id:string;key:CryptoKey}|undefined>);
 if(!row)store.put({id:"device",key:candidate});
 await done;
 return row?.key||candidate;
}
export async function storeWorkerCatalog(token:string,catalog:WorkerCatalog):Promise<void>{
 const hash=await fingerprint(token),db=await open();
 try{
  const tx=db.transaction("catalogs","readwrite"),done=complete(tx);
  tx.objectStore("catalogs").put({hash,catalog,savedAt:Date.now()});
  await done;
 }finally{db.close();}
}
export async function loadWorkerCatalog(token:string):Promise<WorkerCatalog|null>{
 const hash=await fingerprint(token),db=await open();
 try{
  const row=await result(db.transaction("catalogs","readonly").objectStore("catalogs")
   .get(hash) as IDBRequest<{catalog:WorkerCatalog;savedAt:number}|undefined>);
  if(!row||Date.now()-row.savedAt>14*86400000)return null;
  return row.catalog;
 }finally{db.close();}
}
export async function queueWorkerRecord(token:string,payload:WorkerSubmission):Promise<void>{
 if(!/^[a-f0-9-]{36}$/i.test(payload.mutationId))throw Error("Invalid request ID");
 const hash=await fingerprint(token),db=await open();
 try{
  const key=await deviceKey(db);
  const current=await result(db.transaction("records","readonly").objectStore("records").getAll() as IDBRequest<Stored[]>);
  if(current.length>=LIMIT)throw Error("Offline queue limit reached");
  if(current.some(r=>r.id===payload.mutationId))throw Error("Duplicate queued request ID");
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes));
  const tx=db.transaction("records","readwrite"),done=complete(tx);
  tx.objectStore("records").add({
   id:payload.mutationId,linkHash:hash,createdAt:new Date().toISOString(),
   iv:Array.from(iv),cipher:Array.from(cipher)
  } satisfies Stored);
  await done;
 }finally{db.close();}
}
export async function listWorkerRecords(token:string):Promise<QueuedWorkerRecord[]>{
 const hash=await fingerprint(token),db=await open();
 try{
  const key=await deviceKey(db);
  const rows=await result(db.transaction("records","readonly").objectStore("records").getAll() as IDBRequest<Stored[]>);
  const decoded:QueuedWorkerRecord[]=[];
  for(const row of rows.filter(r=>r.linkHash===hash)){
   const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(row.iv)},
     key,new Uint8Array(row.cipher));
   decoded.push({id:row.id,createdAt:row.createdAt,
    payload:JSON.parse(new TextDecoder().decode(plain)) as WorkerSubmission});
  }
  return decoded.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 }finally{db.close();}
}
export async function deleteWorkerRecord(id:string):Promise<void>{
 const db=await open();
 try{
  const tx=db.transaction("records","readwrite"),done=complete(tx);
  tx.objectStore("records").delete(id);
  await done;
 }finally{db.close();}
}
