import {NextResponse} from "next/server";
import {managerAccess,NO_STORE} from "@/lib/carwashCapability";
import {riyadhDayKey} from "@/lib/carwashCalendarDay";
import {pendingNetworkDifference} from "@/lib/carwashPendingVariances";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try{
  const access=await managerAccess(request);
  if(!access)return NextResponse.json({error:"صلاحية المدير مطلوبة"},{status:403,headers:NO_STORE});
  const {admin}=access;
  const [days,reports,variances,items]=await Promise.all([
   admin.from("carwash_days").select("business_date,status").order("business_date",{ascending:false}).limit(1000),
   admin.from("carwash_worker_day_reports").select("business_date,actual_card,terminal_total").order("business_date",{ascending:false}).limit(1000),
   admin.from("carwash_day_settlements").select("business_date,cash_difference,card_difference").order("business_date",{ascending:false}).limit(1000),
   admin.from("carwash_inventory_items").select("id,name,stock_qty,min_qty").eq("active",true).gt("min_qty",0).order("id").limit(1000)
  ]);
  if([days,reports,variances,items].some(r=>r.error))throw Error("Read failed");
  const submitted=new Set((reports.data||[]).map(r=>r.business_date));
  const unresolved=new Set((days.data||[]).filter(d=>d.status!=="approved").map(d=>d.business_date));
  const alerts:Array<{id:string;kind:string;label:string;href:string}>=[];
  const dayHref=(day:string)=>"/?tab=settlement&day="+encodeURIComponent(day);
  for(const d of days.data||[]){
   if(d.status!=="approved"&&(submitted.has(d.business_date)||d.status==="awaiting_owner"))
    alerts.push({id:"pending:"+d.business_date,kind:"pending",label:"موازنة بانتظار الاعتماد: "+d.business_date,href:dayHref(d.business_date)});
  }
  const settled=new Set((variances.data||[]).map(v=>v.business_date));
  for(const r of reports.data||[]){
   if(!unresolved.has(r.business_date)||settled.has(r.business_date))continue;
   const gap=pendingNetworkDifference(r.actual_card,r.terminal_total);
   if(gap!==0)alerts.push({id:"pending-network:"+r.business_date,kind:"variance",label:`فرق الشبكة في تقرير العامل المعلق ${r.business_date}: ${gap.toFixed(2)} ر.س (قيمة التقرير مقابل جهاز الشبكة)`,href:dayHref(r.business_date)});
  }
  for(const v of variances.data||[]){
   if(unresolved.has(v.business_date)&&(Number(v.cash_difference)!==0||Number(v.card_difference)!==0))
    alerts.push({id:"variance:"+v.business_date,kind:"variance",label:`فروقات ${v.business_date}: كاش ${v.cash_difference} ر.س، شبكة ${v.card_difference} ر.س`,href:dayHref(v.business_date)});
  }
  for(const i of items.data||[]){
   if(Number(i.stock_qty)<=Number(i.min_qty))alerts.push({id:"stock:"+i.id,kind:"stock",label:"مخزون منخفض: "+i.name,href:"/?tab=expenses&section=inventory#item-"+i.id});
  }
  const today=riyadhDayKey(new Date()),day=days.data?.find(d=>d.business_date===today);
  return NextResponse.json({alerts,todayStatus:day?.status==="approved"?"معتمد":day?.status==="awaiting_owner"||submitted.has(today)?"بانتظار الاعتماد":"غير معتمد",updatedAt:new Date().toISOString(),truncated:[days,reports,variances,items].some(r=>(r.data?.length||0)>=1000)},{headers:NO_STORE});
 }catch{return NextResponse.json({error:"تعذر تحديث تنبيهات المدير"},{status:503,headers:NO_STORE});}
}
