import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from "node:crypto";
const envelope=/^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]{86}$/;
const tokenRe=/^[a-f0-9]{64}$/;
export function ownerLinkKey(secret:string,project:string):Buffer{
 if(!secret||secret.length<48||!project)return Buffer.alloc(0);
 return Buffer.from(hkdfSync("sha256",Buffer.from(secret),
  Buffer.from("bright-carwash-owner-link-v1"),Buffer.from(project),32));
}
export function serverOwnerLinkKey(){
 return ownerLinkKey(process.env.SUPABASE_SERVICE_ROLE_KEY||"",
  process.env.NEXT_PUBLIC_SUPABASE_URL||"");
}
function guard(key:Buffer){
 if(key.length!==32)throw Error("Manager link vault key unavailable");
}
export function sealOwnerLink(token:string,owner:string,key:Buffer):string{
 guard(key);
 if(!tokenRe.test(token)||!owner)throw Error("Invalid manager link input");
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key,iv);
 cipher.setAAD(Buffer.from("owner-link:"+owner));
 const text=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),
  text.toString("base64url")].join(".");
}
export function revealOwnerLink(envelopeText:string,owner:string,key:Buffer):string{
 guard(key);
 if(!envelope.test(envelopeText)||!owner)throw Error("Malformed encrypted manager link");
 const [,rawIv,rawTag,rawData]=envelopeText.split(".");
 const iv=Buffer.from(rawIv,"base64url"),tag=Buffer.from(rawTag,"base64url");
 const data=Buffer.from(rawData,"base64url");
 if(iv.length!==12||tag.length!==16||data.length!==64||
  iv.toString("base64url")!==rawIv||
  tag.toString("base64url")!==rawTag||
  data.toString("base64url")!==rawData)
  throw Error("Invalid encrypted manager link encoding");
 const decipher=createDecipheriv("aes-256-gcm",key,iv);
 decipher.setAAD(Buffer.from("owner-link:"+owner));
 decipher.setAuthTag(tag);
 const token=Buffer.concat([decipher.update(data),decipher.final()]).toString("utf8");
 if(!tokenRe.test(token))throw Error("Manager token integrity failure");
 return token;
}
