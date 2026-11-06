import "server-only";
import {createHash,randomBytes} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {createAdminClient} from "./supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "./carwashPinPassword";

export const OWNER_COOKIE="__Host-carwash_owner_device";
export const OWNER_COOKIE_AGE=60*60*24*90;
export const NO_STORE={"Cache-Control":"no-store, private, max-age=0"};

export function createCapability(){return randomBytes(32).toString("hex");}
export function capabilityHash(token:string){return createHash("sha256").update(token).digest("hex");}
export function validCapability(token:unknown):token is string{
 return typeof token==="string"&&/^[a-f0-9]{64}$/.test(token);
}
export function requestIsSameOrigin(request:Request){
 const origin=request.headers.get("origin");
 const fetchSite=request.headers.get("sec-fetch-site");
 return (!origin||origin===new URL(request.url).origin)&&
  (!fetchSite||fetchSite==="same-origin"||fetchSite==="none");
}
export async function managerAccess(request:Request){
 assertDedicatedCarwashDatabase();
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return null;
 const admin=createAdminClient();
 const {data,error}=await admin.auth.getUser(token);
 if(error||!data.user)return null;
 const {data:member,error:memberError}=await admin.from("app_members")
  .select("role,active").eq("user_id",data.user.id).maybeSingle();
 if(memberError||!member?.active||member.role!=="manager")return null;
 return {admin,user:data.user};
}
export async function mintManagerSession(userId:string){
 const admin=createAdminClient();
 const {data:userData,error:getError}=await admin.auth.admin.getUserById(userId);
 if(getError||!userData.user?.email||!userData.user.email_confirmed_at)return null;
 const {data:member,error:memberError}=await admin.from("app_members")
  .select("role,active").eq("user_id",userId).maybeSingle();
 if(memberError||member?.role!=="manager"||!member.active)return null;
 const generated=await admin.auth.admin.generateLink({
  type:"magiclink",email:userData.user.email
 });
 const hash=generated.data?.properties?.hashed_token;
 if(generated.error||generated.data.user?.id!==userId||!hash)return null;
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {auth:{persistSession:false,autoRefreshToken:false}});
 const verified=await auth.auth.verifyOtp({token_hash:hash,type:"magiclink"});
 if(verified.error||verified.data.user?.id!==userId||!verified.data.session)return null;
 return {access_token:verified.data.session.access_token,
  refresh_token:verified.data.session.refresh_token};
}
