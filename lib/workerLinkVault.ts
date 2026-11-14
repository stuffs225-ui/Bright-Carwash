import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from "node:crypto";

/**
 * Server-route-only vault for the shareable worker token.
 * Existing URL hashes remain the authentication source of truth.
 * The service role secret is used as the high-entropy HKDF input; it is never
 * persisted into the database or sent to worker/manager browsers.
 */
export function workerLinkVaultKey(secret:string,project:string):Buffer {
 if(!secret||secret.length<48||!project)return Buffer.alloc(0);
 return Buffer.from(hkdfSync("sha256",Buffer.from(secret),Buffer.from("bright-carwash-worker-link-v1"),
  Buffer.from(project),32));
}
const isToken=(s:string)=>/^[a-f0-9]{64}$/.test(s);
const isEnvelope=(s:string)=>/^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]{86}$/.test(s);
function checkKey(key:Buffer){
 if(key.length!==32)throw Error("Worker link vault unavailable");
}
export function sealWorkerLinkToken(token:string,managerId:string,key:Buffer):string {
 checkKey(key);
 if(!isToken(token)||!managerId)throw Error("Invalid worker link input");
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key,iv);
 cipher.setAAD(Buffer.from("worker-link:"+managerId));
 const data=Buffer.concat([cipher.update(Buffer.from(token,"utf8")),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),
  data.toString("base64url")].join(".");
}
export function revealWorkerLinkToken(ciphertext:string,managerId:string,key:Buffer):string{
 checkKey(key);
 if(!isEnvelope(ciphertext)||!managerId)throw Error("Invalid worker link envelope");
 const [,iv,tag,ciphertext64]=ciphertext.split(".");
 const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"base64url"));
 decipher.setAAD(Buffer.from("worker-link:"+managerId));
 decipher.setAuthTag(Buffer.from(tag,"base64url"));
 const token=Buffer.concat([decipher.update(Buffer.from(ciphertext64,"base64url")),
  decipher.final()]).toString("utf8");
 if(!isToken(token))throw Error("Invalid worker token");
 return token;
}
export function serverWorkerLinkKey(){
 return workerLinkVaultKey(process.env.SUPABASE_SERVICE_ROLE_KEY||"",
  process.env.NEXT_PUBLIC_SUPABASE_URL||"");
}
