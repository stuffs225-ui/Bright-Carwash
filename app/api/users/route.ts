import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {canInviteCarwashAccount,canModifyCarwashAccount} from "@/lib/carwashMemberPermissions";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";

type AppRole="manager"|"worker";
const unauthorized=()=>NextResponse.json({error:"Carwash management authorization required"},
 {status:403,headers:{"Cache-Control":"no-store"}});
async function managerAccess(request:Request){
 try{assertDedicatedCarwashDatabase();}catch{return null;}
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return null;
 const admin=createAdminClient();
 const {data,error}=await admin.auth.getUser(token);
 if(error||!data.user)return null;
 const {data:member}=await admin.from("app_members").select("role,active")
   .eq("user_id",data.user.id).maybeSingle();
 if(!member?.active||member.role!=="manager")return null;
 return {admin,viewerId:data.user.id,viewerRole:"manager" as const};
}
function sameOrigin(request:Request){
 const origin=request.headers.get("origin");
 return !origin||origin===new URL(request.url).origin;
}
export async function GET(request:Request){
 const access=await managerAccess(request);
 if(!access)return unauthorized();
 const {data:members,error}=await access.admin.from("app_members")
  .select("user_id,role,active,created_at").eq("role","worker")
  .order("created_at",{ascending:false});
 if(error)return NextResponse.json({error:"تعذر قراءة حساب العامل"},{status:503});
 const users:{id:string;email?:string}[]=[];
 for(let page=1;page<=20;page++){
  const found=await access.admin.auth.admin.listUsers({page,perPage:100});
  if(found.error)return NextResponse.json({error:"تعذر قراءة المستخدمين"},{status:503});
  users.push(...found.data.users);
  if(found.data.users.length<100)break;
 }
 const emails=new Map(users.map(u=>[u.id,u.email||null]));
 return NextResponse.json({members:(members||[]).map(m=>({
  ...m,email:emails.get(m.user_id)||null
 }))},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
 const access=await managerAccess(request);
 if(!access)return unauthorized();
 if(!sameOrigin(request))return unauthorized();
 if(Number(request.headers.get("content-length")||"0")>2048)return unauthorized();
 const body=await request.json().catch(()=>null);
 const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
 const role:AppRole=body?.role;
 if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||
    role!=="worker"||!canInviteCarwashAccount(access.viewerRole,role))
  return NextResponse.json({error:"أدخل بريد العامل الإلكتروني الصحيح"},{status:400});
 // Preserve approved single shared worker-account model.
 const {count,error:existingError}=await access.admin.from("app_members")
  .select("user_id",{count:"exact",head:true}).eq("role","worker").eq("active",true);
 if(existingError)return NextResponse.json({error:"تعذر التأكد من الحساب الحالي"},{status:503});
 if((count||0)>0)return NextResponse.json({
  error:"يوجد حساب عامل نشط بالفعل؛ يمكنك تعطيله قبل إضافة حساب آخر."
 },{status:409});
 for(let page=1;page<=20;page++){
  const found=await access.admin.auth.admin.listUsers({page,perPage:100});
  if(found.error)return NextResponse.json({error:"تعذر التأكد من البريد"},{status:503});
  if(found.data.users.some(u=>u.email?.toLowerCase()===email))
   return NextResponse.json({error:"البريد مستخدم بالفعل؛ لن يُنشأ حساب مكرر"},{status:409});
  if(found.data.users.length<100)break;
 }
 // Worker owns the mailbox: no preset PIN and no fake confirmation.
 const created=await access.admin.auth.admin.createUser({email,email_confirm:false});
 if(created.error||!created.data.user)
  return NextResponse.json({error:"تعذر إنشاء حساب البريد، راجع صحته"},{status:503});
 const {error:membershipError}=await access.admin.from("app_members").insert({
  user_id:created.data.user.id,role:"worker",active:true
 });
 if(membershipError){
  // Remove only the unused Auth user created by THIS request.
  await access.admin.auth.admin.deleteUser(created.data.user.id);
  return NextResponse.json({error:"تعذر تفعيل عضوية العامل"},{status:503});
 }
 return NextResponse.json({ok:true,user_id:created.data.user.id,
   message:"تم إنشاء حساب العامل. يجب أن يتحقق من بريده ويعيّن PIN عبر خيار أول مرة."},
  {headers:{"Cache-Control":"no-store"}});
}
export async function PATCH(request:Request){
 const access=await managerAccess(request);
 if(!access)return unauthorized();
 if(!sameOrigin(request))return unauthorized();
 const body=await request.json().catch(()=>null);
 const id=typeof body?.user_id==="string"?body.user_id:"";
 const role:AppRole=body?.role;
 if(!/^[a-f0-9-]{36}$/i.test(id)||role!=="worker"||typeof body?.active!=="boolean")
  return NextResponse.json({error:"طلب غير صالح"},{status:400});
 if(id===access.viewerId)return unauthorized();
 const {data:target}=await access.admin.from("app_members").select("role")
  .eq("user_id",id).maybeSingle();
 if(!target?.role||!canModifyCarwashAccount(access.viewerRole,target.role,role))
  return unauthorized();
 const {error}=await access.admin.from("app_members")
  .update({role:"worker",active:body.active}).eq("user_id",id);
 if(error)return NextResponse.json({error:"تعذر تحديث الحالة"},{status:503});
 return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}
