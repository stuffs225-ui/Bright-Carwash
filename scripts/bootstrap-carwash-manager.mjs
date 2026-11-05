// Run ONLY from an authorized operations terminal against the independent carwash DB.
// npm ci && node scripts/bootstrap-carwash-manager.mjs
// Required environment: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// CARWASH_BOOTSTRAP_MANAGER_PHONE. NEVER commit credentials or mobile numbers.
import { createClient } from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const raw=process.env.CARWASH_BOOTSTRAP_MANAGER_PHONE;
if(!url||!key||!raw){
 console.error("Independent Carwash database, service key and manager phone are required.");
 process.exit(1);
}
const normalized=raw.replace(/[^\d+]/g,"").replace(/^00966/,"+966").replace(/^966/,"+966")
 .replace(/^0(?=5\d{8}$)/,"+966");
if(!/^\+9665\d{8}$/.test(normalized)){
 console.error("Bootstrap manager number must be a valid Saudi mobile.");
 process.exit(1);
}
if(!new URL(url).hostname.endsWith(".supabase.co")){
 console.error("Refusing to bootstrap outside a reviewed independent Supabase project.");
 process.exit(1);
}
const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
let found=null;
for(let page=1;page<=20;page++){
 const {data,error}=await client.auth.admin.listUsers({page,perPage:100});
 if(error)throw new Error("Auth directory lookup failed: "+error.message);
 found=data.users.find(user=>user.phone===normalized);
 if(found||data.users.length<100)break;
}
if(!found){
 const {data,error}=await client.auth.admin.createUser({phone:normalized,phone_confirm:true});
 if(error||!data.user)throw new Error("Manager Auth provisioning failed: "+(error?.message||"Unknown"));
 found=data.user;
}
const {data:existing,error:checkError}=await client.from("app_members").select("role,active")
 .eq("user_id",found.id).maybeSingle();
if(checkError)throw new Error("Cannot verify carwash roles: "+checkError.message);
if(existing && existing.role!=="manager"){
 throw new Error("Existing user has a different role; manual security review required.");
}
const {error}=await client.from("app_members")
 .upsert({user_id:found.id,role:"manager",active:true},{onConflict:"user_id"});
if(error)throw new Error("Could not activate manager role: "+error.message);
console.log("Carwash manager role provisioned for an existing verified phone identity.");
console.log("SMS OTP still requires a configured and tested Auth SMS provider.");
