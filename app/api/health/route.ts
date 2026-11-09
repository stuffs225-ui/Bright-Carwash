import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const NO_STORE={"Cache-Control":"no-store, private"};

export async function GET(){
 try{
  assertDedicatedCarwashDatabase();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!anonKey)throw Error("configuration missing");
  const admin=createAdminClient();
  // A healthy auth server does not establish database and private storage
  // availability. Check all three using READ-ONLY operations.
  const [auth,database,storage]=await Promise.all([
   fetch(url+"/auth/v1/health",{headers:{apikey:anonKey},cache:"no-store"})
    .then(response=>response.ok).catch(()=>false),
   admin.from("settings").select("key",{count:"exact",head:true}),
   admin.storage.from("backups").list("daily",{limit:1})
  ]);
  const checks={
   auth,
   database:!database.error,
   privateBackupStorage:!storage.error
  };
  const ok=Object.values(checks).every(Boolean);
  return NextResponse.json({ok,service:"bright-carwash-v2",checks},
   {status:ok?200:503,headers:NO_STORE});
 }catch{
  // Public health checks must never reveal keys, environment values, storage
  // paths, personal information, or detailed provider failures.
  return NextResponse.json({ok:false,service:"bright-carwash-v2",
   error:"Service dependencies unavailable"},
   {status:503,headers:NO_STORE});
 }
}
