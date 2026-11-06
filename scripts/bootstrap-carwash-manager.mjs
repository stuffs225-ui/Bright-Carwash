// Provision initial carwash manager ONLY in a verified independent Supabase DB.
// Environment secrets: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// CARWASH_DATABASE_PROJECT_REF, CARWASH_BOOTSTRAP_MANAGER_PHONE,
// CARWASH_BOOTSTRAP_MANAGER_PIN, CARWASH_PIN_PEPPER.
// Do not place these values in GitHub, command flags, or diagnostic logs.
import {createClient} from "@supabase/supabase-js";
import {createHmac,randomBytes} from "node:crypto";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref=process.env.CARWASH_DATABASE_PROJECT_REF;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const mobile=process.env.CARWASH_BOOTSTRAP_MANAGER_PHONE;
const pin=process.env.CARWASH_BOOTSTRAP_MANAGER_PIN;
const pepper=process.env.CARWASH_PIN_PEPPER;
if(!url||!ref||!key||!mobile||!pepper||!pin||
 !/^[0-9a-z]{20}$/.test(ref)||new URL(url).hostname!==ref+".supabase.co"||
 !/^\+9665\d{8}$/.test(mobile)||!/^\d{4}$/.test(pin)||pepper.length<32){
 throw new Error("Standalone carwash database and encrypted manager bootstrap values required");
}
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
let found=null;
for(let page=1;page<=20;page++){
 const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});
 if(error)throw new Error("Unable to inspect initial carwash Auth account");
 found=data.users.find(u=>u.phone===mobile);
 if(found||data.users.length<100)break;
}
let created=false;
if(!found){
 const {data,error}=await admin.auth.admin.createUser({
  phone:mobile,phone_confirm:true,password:randomBytes(48).toString("hex"),
 });
 if(error||!data.user)throw new Error("Could not create initial manager identity");
 found=data.user;created=true;
}
const role=await admin.from("app_members").select("role,active")
 .eq("user_id",found.id).maybeSingle();
if(role.error)throw new Error("Cannot verify carwash membership");
if(role.data&&role.data.role!=="manager")
 throw new Error("Existing identity has non-manager role; manual review required");
if(role.data?.active&&!created){
 console.log("Existing manager account preserved. PIN NOT RESET by rerunning bootstrap.");
 process.exit(0);
}
const password="CarwashV2#"+createHmac("sha256",pepper)
 .update("pin-v2|"+found.id+"|"+pin).digest("hex");
const update=await admin.auth.admin.updateUserById(found.id,{password,phone_confirm:true});
if(update.error){
 if(created)await admin.auth.admin.deleteUser(found.id);
 throw new Error("Initial manager PIN provisioning failed");
}
const membership=await admin.from("app_members")
 .upsert({user_id:found.id,role:"manager",active:true},{onConflict:"user_id"});
if(membership.error){
 if(created)await admin.auth.admin.deleteUser(found.id);
 throw new Error("Manager membership provisioning failed");
}
console.log("Initial carwash manager is active with PIN-derived secure Auth credential.");
console.log("Change the initial PIN from Account Information after first sign-in.");
