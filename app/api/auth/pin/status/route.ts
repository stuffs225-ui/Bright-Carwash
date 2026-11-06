import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, max-age=0, private"};
export async function GET(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  const admin=createAdminClient();
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  const user=data.user;
  const member=await admin.from("app_members").select("role,active")
    .eq("user_id",user.id).maybeSingle();
  if(member.error||!member.data?.active||!["manager","worker"].includes(member.data.role))
   return NextResponse.json({error:"Forbidden"},{status:403,headers});
  const result=await admin.from("carwash_manager_pin_verifiers")
   .select("user_id").eq("user_id",user.id).maybeSingle();
  if(result.error)return NextResponse.json({error:"Unavailable"},{status:503,headers});
  return NextResponse.json({configured:!!result.data,
   email:user.email||"",role:member.data.role,active:true},{headers});
 }catch{return NextResponse.json({error:"Unavailable"},{status:503,headers});}
}
