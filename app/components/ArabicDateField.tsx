"use client";
import {useMemo} from "react";

const AR="ar-SA-u-ca-gregory-nu-latn";
const MONTHS=Array.from({length:12},(_,i)=>
 new Intl.DateTimeFormat(AR,{month:"long",timeZone:"UTC"}).format(new Date(Date.UTC(2024,i,1))));
const pad=(n:number)=>String(n).padStart(2,"0");
const daysInMonth=(year:number,month:number)=>new Date(Date.UTC(year,month,0)).getUTCDate();
export function arabicDate(value:string):string{
 const date=new Date(value+"T12:00:00Z");
 return Number.isFinite(date.getTime())
  ?new Intl.DateTimeFormat(AR,{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(date)
  :value;
}
function yearOptions(selected:number){
 const end=Math.max(new Date().getUTCFullYear()+1,selected);
 const start=Math.min(2018,selected);
 return Array.from({length:end-start+1},(_,i)=>end-i);
}
export function ArabicDateField({value,onChange,ariaLabel,max}:{
 value:string;onChange:(next:string)=>void;ariaLabel:string;max?:string
}){
 const parts=/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split("-").map(Number):[2026,1,1];
 const [year,month,day]=parts;
 const count=useMemo(()=>daysInMonth(year,month),[year,month]);
 function update(y:number,m:number,d:number){
  const next=y+"-"+pad(m)+"-"+pad(Math.min(d,daysInMonth(y,m)));
  if(max&&next>max)return;
  onChange(next);
 }
 return <div className="space-y-1">
  <div className="arabic-date-grid" role="group" aria-label={ariaLabel}>
   <select aria-label={ariaLabel+" — اليوم"} value={Math.min(day,count)}
    onChange={e=>update(year,month,Number(e.target.value))}>
    {Array.from({length:count},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}
   </select>
   <select aria-label={ariaLabel+" — الشهر"} value={month}
    onChange={e=>update(year,Number(e.target.value),day)}>
    {MONTHS.map((name,i)=><option key={i+1} value={i+1}>{name}</option>)}
   </select>
   <select aria-label={ariaLabel+" — السنة"} value={year}
    onChange={e=>update(Number(e.target.value),month,day)}>
    {yearOptions(year).map(y=><option key={y} value={y}>{y}</option>)}
   </select>
  </div>
  <p className="txt-muted text-xs">{arabicDate(value)}</p>
 </div>;
}
export function ArabicMonthField({value,onChange,ariaLabel}:{
 value:string;onChange:(next:string)=>void;ariaLabel:string
}){
 const parts=/^\d{4}-\d{2}$/.test(value)?value.split("-").map(Number):[2026,1];
 const [year,month]=parts;
 return <div className="arabic-month-grid" role="group" aria-label={ariaLabel}>
  <select aria-label={ariaLabel+" — الشهر"} value={month}
   onChange={e=>onChange(year+"-"+pad(Number(e.target.value)))}>
   {MONTHS.map((name,i)=><option key={i+1} value={i+1}>{name}</option>)}
  </select>
  <select aria-label={ariaLabel+" — السنة"} value={year}
   onChange={e=>onChange(e.target.value+"-"+pad(month))}>
   {yearOptions(year).map(y=><option key={y} value={y}>{y}</option>)}
  </select>
 </div>;
}
