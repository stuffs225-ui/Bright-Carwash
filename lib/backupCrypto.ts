import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";

// Fixed, independently verifiable binary envelope; the key is NEVER embedded.
const MAGIC=Buffer.from("BCW2-BACKUP-1\\n","utf8");
const IV_SIZE=12;
const TAG_SIZE=16;
export function parseBackupKey(encoded:string):Buffer{
 const trimmed=encoded.trim();
 if(!/^[A-Za-z0-9+/]{43}=$/.test(trimmed))throw Error("Backup key must be a 32-byte base64 secret");
 const key=Buffer.from(trimmed,"base64");
 if(key.length!==32||key.toString("base64")!==trimmed)throw Error("Invalid backup encryption key");
 return key;
}
export function encryptBackup(payload:unknown,key:Buffer):Buffer{
 if(key.length!==32)throw Error("Expected AES-256 key");
 const iv=randomBytes(IV_SIZE);
 const cipher=createCipheriv("aes-256-gcm",key,iv);
 const clear=gzipSync(Buffer.from(JSON.stringify(payload),"utf8"));
 const encrypted=Buffer.concat([cipher.update(clear),cipher.final()]);
 return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),encrypted]);
}
export function decryptBackup(blob:Buffer,key:Buffer):unknown{
 if(key.length!==32||blob.length<=MAGIC.length+IV_SIZE+TAG_SIZE||
  !blob.subarray(0,MAGIC.length).equals(MAGIC))throw Error("Invalid encrypted backup");
 const offset=MAGIC.length;
 const decipher=createDecipheriv("aes-256-gcm",key,blob.subarray(offset,offset+IV_SIZE));
 decipher.setAuthTag(blob.subarray(offset+IV_SIZE,offset+IV_SIZE+TAG_SIZE));
 return JSON.parse(gunzipSync(Buffer.concat([
  decipher.update(blob.subarray(offset+IV_SIZE+TAG_SIZE)),decipher.final()
 ])).toString("utf8"));
}
