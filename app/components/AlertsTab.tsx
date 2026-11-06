"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";
import { getOperationalShiftBounds, formatCurrency } from "@/lib/business";

type AlertKey = "alert_max_monthly_expenses" | "alert_max_daily_income" |
  "alert_max_monthly_income" | "alert_shift_car_target" | "alert_max_daily_cars";

const ALERT_DEFS: {key:AlertKey;label:string;metric:"money"|"count"}[] = [
 {key:"alert_max_monthly_expenses",label:"الحد الأعلى للمصروفات الشهرية",metric:"money"},
 {key:"alert_max_daily_income",label:"هدف الدخل اليومي",metric:"money"},
 {key:"alert_max_monthly_income",label:"هدف الدخل الشهري",metric:"money"},
 {key:"alert_shift_car_target",label:"هدف سيارات الوردية",metric:"count"},
 {key:"alert_max_daily_cars",label:"هدف عدد السيارات اليومي",metric:"count"},
];
type Wash = {occurred_at:string;gross:number;deleted_at:string|null};
type Outlay = {occurred_at:string;amount:number;deleted_at:string|null};

function riyadhDayBounds(now:Date) {
  const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const get=(key:string)=>Number(p.find(x=>x.type===key)?.value);
  const year=get("year"), month=get("month"),day=get("day");
  const start=new Date(Date.UTC(year,month-1,day,-3));
  const monthStart=new Date(Date.UTC(year,month-1,1,-3));
  return {dayStart:start,dayEnd:new Date(start.getTime()+86400000),monthStart};
}

export function AlertsTab({isOwner}: {isOwner:boolean}) {
  const [thresholds,setThresholds]=useState<Record<AlertKey,number>>({
    alert_max_monthly_expenses:0,alert_max_daily_income:0,
    alert_max_monthly_income:0,alert_shift_car_target:0,alert_max_daily_cars:0,
  });
  const [cars,setCars]=useState<Wash[]>([]);
  const [expenses,setExpenses]=useState<Outlay[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    const {monthStart}=riyadhDayBounds(new Date());
    const lookBack = new Date(monthStart.getTime() - 86400000);
    const [settingRows,entryRows,expenseRows]=await Promise.all([
      supabase.from("settings").select("key,value").in("key",ALERT_DEFS.map(x=>x.key)),
      fetchAllRows<Wash>((from,to)=>supabase.from("entries")
        .select("occurred_at,gross,deleted_at").is("deleted_at",null)
        .gte("occurred_at",lookBack.toISOString()).range(from,to)),
      fetchAllRows<Outlay>((from,to)=>supabase.from("expenses")
        .select("occurred_at,amount,deleted_at").is("deleted_at",null)
        .gte("occurred_at",monthStart.toISOString()).range(from,to))
    ]);
    if(settingRows.error) {setMessage(settingRows.error.message);return;}
    setThresholds(previous=>{
      const next={...previous};
      for(const row of settingRows.data||[]){
        if(row.key in next) next[row.key as AlertKey]=Number(row.value)||0;
      }
      return next;
    });
    setCars(entryRows);
    setExpenses(expenseRows);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const values=useMemo(()=>{
    const now=new Date(), {dayStart,dayEnd,monthStart}=riyadhDayBounds(now);
    const shift=getOperationalShiftBounds(now);
    const inDay=(iso:string)=>{const t=new Date(iso);return t>=dayStart&&t<dayEnd;};
    const inShift=(iso:string)=>{const t=new Date(iso);return t>=shift.start&&t<shift.end;};
    return {
      alert_max_monthly_expenses:expenses.filter(x=>new Date(x.occurred_at)>=monthStart).reduce((s,x)=>s+Number(x.amount),0),
      alert_max_daily_income:cars.filter(x=>inDay(x.occurred_at)).reduce((s,x)=>s+Number(x.gross),0),
      alert_max_monthly_income:cars.filter(x=>new Date(x.occurred_at)>=monthStart).reduce((s,x)=>s+Number(x.gross),0),
      alert_shift_car_target:cars.filter(x=>inShift(x.occurred_at)).length,
      alert_max_daily_cars:cars.filter(x=>inDay(x.occurred_at)).length,
    };
  },[cars,expenses]);
  async function save(){
    setBusy(true);setMessage("");
    try {
      if(!isOwner) throw new Error("مدير المغسلة فقط يستطيع تعديل الأهداف");
      for(const item of ALERT_DEFS){
        const {error}=await supabase.from("settings").update({value:thresholds[item.key]}).eq("key",item.key);
        if(error) throw error;
      }
      setMessage("تم حفظ الأهداف بنجاح.");
    }catch(e){setMessage(e instanceof Error?e.message:"فشل حفظ الإعدادات");}
    finally{setBusy(false);}
  }
  const condition=(key:AlertKey,value:number,limit:number)=>{
    if(key==="alert_max_monthly_expenses") return value>limit?"تجاوز المصروف الشهري الحد":"ضمن حد المصروف";
    return value>=limit?"تم بلوغ الهدف":"لم يُبلغ الهدف";
  };
  return <div dir="rtl" className="space-y-5">
    <section className="card">
      <h2 className="section-title">تنبيهات تشغيل المغسلة</h2>
      <p className="txt-muted text-sm">تُقاس أهداف الدخل والسيارات وفق اليوم التقويمي بالرياض، وتُقاس مكافآت الوردية وفق 3 عصرًا–4 فجرًا. القيمة صفر تعني تعطيل التنبيه.</p>
      <div className="overflow-x-auto mt-4"><table className="app-table">
        <thead><tr><th>المؤشر</th><th>القيمة الحالية</th><th>الهدف/الحد</th><th>الحالة</th></tr></thead>
        <tbody>{ALERT_DEFS.map(x=>{
          const limit=thresholds[x.key],v=values[x.key],on=limit>0;
          const label=(n:number)=>x.metric==="money"?formatCurrency(n):String(n);
          return <tr key={x.key}><td>{x.label}</td><td>{label(v)}</td><td>
            {isOwner?<input type="number" min="0" step={x.metric==="money"?"0.01":"1"}
              value={limit} onChange={e=>setThresholds(s=>({...s,[x.key]:Math.max(0,Number(e.target.value)||0)}))}/>:label(limit)}
          </td><td>{on?condition(x.key,v,limit):"معطّل"}</td></tr>;
        })}</tbody>
      </table></div>
      {isOwner&&<button type="button" className="btn-primary mt-4" disabled={busy} onClick={()=>void save()}>{busy?"جارٍ الحفظ...":"حفظ أهداف التنبيه"}</button>}
      {message&&<p role="status" className="mt-3 txt-muted">{message}</p>}
    </section>
  </div>;
}
