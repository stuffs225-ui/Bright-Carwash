import {supabase} from "./supabaseClient";

export type WhatsAppDispatchResult={
 configured:boolean;accepted:number;unknown:number;failed:number;
};
/** Authenticated worker/manager can request processing only existing
 * consented and once-per-entry WhatsApp outbox rows. Never specify arbitrary
 * recipient or text from the client.
 */
export async function dispatchCarwashWhatsAppNotices():Promise<WhatsAppDispatchResult>{
 if(typeof navigator==="undefined"||!navigator.onLine)
  return {configured:false,accepted:0,unknown:0,failed:0};
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)return {configured:false,accepted:0,unknown:0,failed:0};
 try{
  const response=await fetch("/api/whatsapp/dispatch-ready",{
   method:"POST",headers:{authorization:"Bearer "+session.access_token},
   cache:"no-store",
  });
  if(!response.ok)return {configured:false,accepted:0,unknown:0,failed:0};
  const result=await response.json();
  return {configured:true,accepted:Number(result.accepted_by_provider||0),
   unknown:Number(result.unknown||0),failed:Number(result.failed||0)};
 }catch{
  return {configured:false,accepted:0,unknown:0,failed:0};
 }
}
