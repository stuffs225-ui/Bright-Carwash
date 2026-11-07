import "server-only";
import {createAdminClient} from "./supabaseAdmin";
import {capabilityHash,managerAccess,validCapability,requestIsSameOrigin} from "./carwashCapability";
import {assertDedicatedCarwashDatabase} from "./carwashPinPassword";
export type CarwashActor={admin:ReturnType<typeof createAdminClient>;actor:"worker"|"manager";
 userId:string|null;linkId:string|null};
export async function resolveCarwashActor(request:Request,token:unknown):Promise<CarwashActor|null>{
 assertDedicatedCarwashDatabase();
 if(!requestIsSameOrigin(request))return null;
 if(validCapability(token)){
  const admin=createAdminClient();
  const {data:link,error}=await admin.from("carwash_worker_links")
   .select("id,created_by,expires_at,revoked_at")
   .eq("token_hash",capabilityHash(token)).maybeSingle();
  if(error||!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())return null;
  const {data:manager}=await admin.from("app_members")
   .select("role,active").eq("user_id",link.created_by).maybeSingle();
  if(!manager?.active||manager.role!=="manager")return null;
  return {admin,actor:"worker",userId:null,linkId:link.id};
 }
 const mgr=await managerAccess(request);
 if(!mgr)return null;
 return {admin:mgr.admin,actor:"manager",userId:mgr.user.id,linkId:null};
}
