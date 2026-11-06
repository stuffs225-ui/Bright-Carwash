import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, private"};

async function dispatch(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  const version=process.env.WHATSAPP_CLOUD_GRAPH_API_VERSION;
  const token=process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  const from=process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
  const template=process.env.WHATSAPP_READY_APPROVED_TEMPLATE;
  const language=process.env.WHATSAPP_READY_TEMPLATE_LANGUAGE||"ar";
  if(process.env.CARWASH_WHATSAPP_LIVE_ENABLED!=="true"||
   !version||!/^v\d{1,3}\.\d{1,2}$/.test(version)||!token||
   !from||!/^\d{6,25}$/.test(from)||!template||
   !/^[a-z0-9_]{1,512}$/.test(template)){
   return NextResponse.json({ok:false,configured:false,
    message:"WhatsApp Business Cloud API and approved template are not connected."},
    {status:503,headers});
  }
  const admin=createAdminClient();
  const authorization=request.headers.get("authorization")||"";
  const cron=process.env.CRON_SECRET;
  const fromCron=!!cron&&authorization==="Bearer "+cron;
  if(!fromCron){
   const match=authorization.match(/^Bearer\s+(.+)$/i);
   if(!match)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
   const user=await admin.auth.getUser(match[1]);
   if(user.error||!user.data.user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
   const member=await admin.from("app_members").select("role,active")
    .eq("user_id",user.data.user.id).maybeSingle();
   if(member.error||!member.data?.active||
    !["manager","worker"].includes(member.data.role))
    return NextResponse.json({error:"Forbidden"},{status:403,headers});
  }
  const claimed=await admin.rpc("carwash_claim_whatsapp_ready",{p_limit:10});
  if(claimed.error)return NextResponse.json({ok:false,error:"Queue unavailable"},
   {status:503,headers});
  let accepted=0,failed=0,unknown=0;
  for(const row of claimed.data||[]){
   const to=String(row.destination_phone||"");
   if(!/^\+9665\d{8}$/.test(to)){
    await admin.rpc("carwash_complete_whatsapp_ready",{
     p_id:row.outbox_id,p_status:"failed",p_error:"Destination is invalid",
    });
    failed++;continue;
   }
   try{
    const response=await fetch(
     "https://graph.facebook.com/"+version+"/"+from+"/messages",{
      method:"POST",headers:{
       "content-type":"application/json",authorization:"Bearer "+token
      },
      body:JSON.stringify({
       messaging_product:"whatsapp",to:to.slice(1),type:"template",
       template:{name:template,language:{code:language}},
      }),signal:AbortSignal.timeout(15000),cache:"no-store"
     }
    );
    if(!response.ok){
     // Never auto-retry: provider may have sent despite a 500 response.
     await admin.rpc("carwash_complete_whatsapp_ready",{
      p_id:row.outbox_id,p_status:response.status>=500?"unknown":"failed",
      p_error:"Meta HTTP "+response.status,
     });
     if(response.status>=500)unknown++;else failed++;
     continue;
    }
    const payload=await response.json().catch(()=>null);
    const id=payload?.messages?.[0]?.id;
    if(typeof id!=="string"||id.length>300){
     await admin.rpc("carwash_complete_whatsapp_ready",{
      p_id:row.outbox_id,p_status:"unknown",
      p_error:"Provider accepted request but no message ID",
     });
     unknown++;continue;
    }
    const completed=await admin.rpc("carwash_complete_whatsapp_ready",{
     p_id:row.outbox_id,p_status:"sent",p_message_id:id,
    });
    if(completed.error||completed.data!==true){unknown++;continue;}
    accepted++;
   }catch{
    // A network timeout is ambiguous; manual reconciliation before resending.
    await admin.rpc("carwash_complete_whatsapp_ready",{
     p_id:row.outbox_id,p_status:"unknown",
     p_error:"Network result ambiguous; manual review required",
    });
    unknown++;
   }
  }
  return NextResponse.json({ok:true,claimed:(claimed.data||[]).length,
   accepted_by_provider:accepted,failed,unknown},{headers});
 }catch{
  return NextResponse.json({ok:false,error:"WhatsApp service unavailable"},
   {status:503,headers});
 }
}

export async function POST(request:Request){return dispatch(request);}
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET;
 if(!expected||request.headers.get("authorization")!=="Bearer "+expected)
  return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 return dispatch(request);
}
