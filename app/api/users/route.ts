import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { normalizeSaudiMobile } from "@/lib/phone";

type AppRole = "owner" | "manager" | "worker";
const ROLES: AppRole[] = ["owner", "manager", "worker"];
async function ownerAccess(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: member } = await admin.from("app_members").select("role,active")
    .eq("user_id", data.user.id).maybeSingle();
  if (!member?.active || member.role !== "owner") return null;
  return { admin, ownerId: data.user.id };
}
const unauthorized = () => NextResponse.json({error:"Owner authorization required"},{status:403});

export async function GET(request: Request) {
  const access = await ownerAccess(request);
  if (!access) return unauthorized();
  const {data: members, error} = await access.admin.from("app_members")
    .select("user_id,role,active,created_at").order("created_at",{ascending:false});
  if(error) return NextResponse.json({error:error.message},{status:500});
  const users = [];
  for(let page=1;page<=20;page++) {
    const result = await access.admin.auth.admin.listUsers({page,perPage:100});
    if(result.error) return NextResponse.json({error:"Unable to read Auth users"},{status:500});
    users.push(...result.data.users);
    if(result.data.users.length < 100) break;
  }
  const phones = new Map(users.map(u=>[u.id,u.phone]));
  return NextResponse.json({members:(members||[]).map(m=>({...m,phone:phones.get(m.user_id)||null}))});
}

export async function POST(request: Request) {
  const access = await ownerAccess(request);
  if (!access) return unauthorized();
  const body = await request.json().catch(()=>null);
  const phone = normalizeSaudiMobile(typeof body?.phone === "string" ? body.phone : "");
  const role: AppRole = body?.role;
  if (!phone || !ROLES.includes(role)) {
    return NextResponse.json({error:"Invalid Saudi phone number or role"},{status:400});
  }
  // Only an authorized owner can pre-provision the phone number.
  // Public OTP sign-up is disabled in the client (shouldCreateUser:false).
  const creation = await access.admin.auth.admin.createUser({phone, phone_confirm:true});
  if (creation.error || !creation.data.user) {
    return NextResponse.json({error:"Unable to provision phone account. It may already exist."},{status:409});
  }
  const {error} = await access.admin.from("app_members").insert({
    user_id:creation.data.user.id, role, active:true,
  });
  if(error) {
    // Roll back only the newly created, unlinked Auth user from this request.
    await access.admin.auth.admin.deleteUser(creation.data.user.id);
    return NextResponse.json({error:"Phone account setup failed; nothing was activated."},{status:500});
  }
  return NextResponse.json({ok:true,user_id:invitation.data.user.id});
}

export async function PATCH(request: Request) {
  const access = await ownerAccess(request);
  if(!access) return unauthorized();
  const body = await request.json().catch(()=>null);
  const id = typeof body?.user_id==="string" ? body.user_id : "";
  const role: AppRole = body?.role;
  if(!/^[a-f0-9-]{36}$/i.test(id) || !ROLES.includes(role) || typeof body?.active!=="boolean") {
    return NextResponse.json({error:"Invalid user, role or active status"},{status:400});
  }
  if(id === access.ownerId && (role !== "owner" || !body.active)) {
    return NextResponse.json({error:"Cannot demote or deactivate your own owner account"},{status:400});
  }
  const {error} = await access.admin.from("app_members").update({role,active:body.active}).eq("user_id",id);
  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true});
}
