import {NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
 const url=new URL(request.url);
 const mode=url.searchParams.get("hub.mode");
 const token=url.searchParams.get("hub.verify_token");
 const challenge=url.searchParams.get("hub.challenge");
 const expected=process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
 if(expected&&mode==="subscribe"&&token===expected&&challenge&&
    /^\d{1,30}$/.test(challenge)){
  return new Response(challenge,{status:200,headers:{"content-type":"text/plain"}});
 }
 return new Response("Forbidden",{status:403});
}

export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  const secret=process.env.WHATSAPP_APP_SECRET;
  if(!secret||secret.length<20)return new Response("Not configured",{status:503});
  const incoming=request.headers.get("x-hub-signature-256")||"";
  if(!/^sha256=[0-9a-f]{64}$/i.test(incoming))
   return new Response("Invalid signature",{status:401});
  const bytes=Buffer.from(await request.arrayBuffer());
  if(bytes.length>100000)return new Response("Payload too large",{status:413});
  const expected=Buffer.from(createHmac("sha256",secret).update(bytes).digest("hex"),"hex");
  const actual=Buffer.from(incoming.slice(7),"hex");
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))
   return new Response("Invalid signature",{status:401});
  const payload=JSON.parse(bytes.toString("utf8"));
  const admin=createAdminClient();
  for(const entry of payload?.entry||[]){
   for(const change of entry?.changes||[]){
    for(const status of change?.value?.statuses||[]){
     const messageId=status?.id;
     if(typeof messageId!=="string"||messageId.length<3||messageId.length>300)continue;
     if(status.status==="delivered"||status.status==="read"){
      await admin.from("ready_sms_outbox").update({
       status:"delivered",delivered_at:new Date().toISOString()
      }).eq("provider_message_id",messageId)
       .in("status",["sent","delivered"]);
     }else if(status.status==="failed"){
      await admin.from("ready_sms_outbox").update({
       status:"failed",last_error:"Provider delivery failed"
      }).eq("provider_message_id",messageId).eq("status","sent");
     }
    }
   }
  }
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch{
  return new Response("Invalid webhook",{status:400});
 }
}
