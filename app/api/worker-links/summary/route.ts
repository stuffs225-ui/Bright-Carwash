import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabaseAdmin";
import {assertDedicatedCarwashDatabase} from "@/lib/carwashPinPassword";
import {capabilityHash,validCapability,managerAccess,requestIsSameOrigin,NO_STORE} from "@/lib/carwashCapability";
import {riyadhDayKey} from "@/lib/carwashCalendarDay";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const deny=(status:number,error:string)=>NextResponse.json({error},{status,headers:NO_STORE});
type Day={date:string;status:"open"|"awaiting_owner";cars:number;cash:number;card:number;crew:number};
const cents=(v:unknown)=>Math.round((Number(v)||0)*100);
export async function POST(request:Request){
 try{
  assertDedicatedCarwashDatabase();
  if(!requestIsSameOrigin(request))return deny(403,"طلب غير مسموح");
  if(Number(request.headers.get("content-length")||"0")>2048)return deny(400,"طلب كبير");
  const body=await request.json().catch(()=>null);
  const token=body?.token;
  const admin=createAdminClient();
  if(typeof token==="string"&&token){
   if(!validCapability(token))return deny(403,"رابط غير صالح");
   const {data:link,error}=await admin.from("carwash_worker_links")
    .select("created_by,expires_at,revoked_at")
    .eq("token_hash",capabilityHash(token)).maybeSingle();
   if(error)return deny(503,"تعذر التحقق من الرابط");
   if(!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())
    return deny(410,"رابط العامل غير نشط");
   const {data:member}=await admin.from("app_members").select("active,role")
    .eq("user_id",link.created_by).maybeSingle();
   if(!member?.active||member.role!=="manager")return deny(403,"الرابط موقوف");
  }else{
   const manager=await managerAccess(request);
   if(!manager)return deny(403,"صلاحية المدير مطلوبة");
  }
  const today=riyadhDayKey(new Date());
  const {data:existing,error:daysError}=await admin.from("carwash_days")
   .select("business_date,status").in("status",["open","awaiting_owner"])
   .order("business_date",{ascending:false}).limit(120);
  if(daysError)return deny(503,"تعذر تحميل الأيام");
  const current=await admin.from("carwash_days").select("status")
   .eq("business_date",today).maybeSingle();
  if(current.error)return deny(503,"تعذر التحقق من اليوم");
  const days:Day[]=(existing||[]).map(r=>({
   date:r.business_date,status:r.status,cars:0,cash:0,card:0,crew:0
  }));
  if(!current.data||current.data.status!=="approved"){
   if(!days.some(d=>d.date===today))days.unshift({
    date:today,status:"open",cars:0,cash:0,card:0,crew:0
   });
  }
  const byDay=new Map(days.map(d=>[d.date,d]));
  const dates=days.map(d=>d.date);
  // Historical imported rows have null business_date and are deliberately NOT
  // included in the worker's operational day or collective 10 SAR allocation.
  for(let start=0;start<dates.length;start+=40){
   const batch=dates.slice(start,start+40);
   for(let from=0;;from+=500){
    const {data,error}=await admin.from("entries")
     .select("id,business_date,cash_paid,card_paid")
     .is("deleted_at",null).in("business_date",batch)
     .order("id",{ascending:true}).range(from,from+499);
    if(error)return deny(503,"تعذر تلخيص التسجيلات");
    for(const row of data||[]){
     const day=byDay.get(row.business_date);
     if(!day)continue;
     day.cars++;
     day.cash+=cents(row.cash_paid);
     day.card+=cents(row.card_paid);
    }
    if((data||[]).length<500)break;
    if(from>50000)return deny(503,"تجاوز الملخص الحد المسموح");
   }
  }
  for(const day of days){
   day.cash=Math.round(day.cash)/100;
   day.card=Math.round(day.card)/100;
   day.crew=day.cars*10;
  }
  return NextResponse.json({
   ok:true,days:days.sort((a,b)=>b.date.localeCompare(a.date)),
   today,crewRatePerCar:10,sharedTeam:true,
   note:"مخصص جماعي للفريق: 10 ريالات لكل سيارة، وليس توزيعًا تلقائيًا على أسماء العمال."
  },{headers:NO_STORE});
 }catch{return deny(503,"تعذر تحميل ملخص الأيام");}
}
