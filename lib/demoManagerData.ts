/** FAKE manager data ONLY. It is deliberately session-scoped and does not access customer systems. */
import {riyadhDayKey} from "./carwashCalendarDay";

export type DemoRow={
 id:string; day:string; car:"سيارة صغيرة"|"سيارة كبيرة";
 service:string;cash:number;card:number;ready:boolean;
};
export type DemoExpense={id:string;day:string;type:string;amount:number;notes:string};
export type DemoWage={id:string;day:string;name:string;kind:"راتب"|"سلفة"|"مكافأة"|"صرف مستحقات";amount:number;notes:string};
export type DemoFinance={expenses:DemoExpense[];wages:DemoWage[];monthlyGoal:number;alertLimit:number};
export type DemoManagerPage="dashboard"|"cars"|"expenses"|"workers"|"reports"|"settings"|"alerts"|"settlement"|"users";

const key="bright_carwash_demo_finance_v3";
export const sum=(items:number[])=>Math.round(items.reduce((a,b)=>a+Number(b||0),0)*100)/100;
export function plusDay(today:string,days:number):string{
 const date=new Date(today+"T12:00:00+03:00");date.setUTCDate(date.getUTCDate()+days);
 return riyadhDayKey(date);
}
export function defaultDemoFinance(today:string):DemoFinance{
 return {monthlyGoal:12500,alertLimit:140,wages:[
  {id:"demo-wage-1",day:plusDay(today,-4),name:"فريق المغسلة",kind:"راتب",amount:420,notes:"عينة تجريبية"},
  {id:"demo-wage-2",day:plusDay(today,-2),name:"فريق المغسلة",kind:"سلفة",amount:90,notes:"سلفة تجريبية"}
 ],expenses:[
  {id:"demo-exp-1",day:plusDay(today,-1),type:"مواد تنظيف",amount:96,notes:"شامبو ومناشف"},
  {id:"demo-exp-2",day:plusDay(today,-3),type:"صيانة",amount:135,notes:"صيانة معدات"},
  {id:"demo-exp-3",day:plusDay(today,-4),type:"رواتب",amount:420,notes:"رواتب عمال"},
  {id:"demo-exp-4",day:plusDay(today,-8),type:"كهرباء ومياه",amount:275,notes:"خدمات تشغيل"},
  {id:"demo-exp-5",day:plusDay(today,-12),type:"إيجار",amount:900,notes:"إيجار تجريبي"},
  {id:"demo-exp-6",day:plusDay(today,-18),type:"مواد تنظيف",amount:175,notes:"مستلزمات تشغيل"},
  {id:"demo-exp-7",day:plusDay(today,-22),type:"أخرى",amount:48,notes:"مشتريات"}
 ]};
}
export function readDemoFinance(today:string):DemoFinance{
 if(typeof window==="undefined")return defaultDemoFinance(today);
 try{
  const raw=sessionStorage.getItem(key);
  if(raw){const parsed=JSON.parse(raw);
   if(Array.isArray(parsed.expenses)&&Array.isArray(parsed.wages))return parsed;}
 }catch{}
 return defaultDemoFinance(today);
}
export function saveDemoFinance(d:DemoFinance){
 if(typeof window!=="undefined"){sessionStorage.setItem(key,JSON.stringify(d));
  window.dispatchEvent(new Event("carwash-demo-financial-updated"));}
}
export function demoDaily(rows:DemoRow[],expenses:DemoExpense[]){
 const map=new Map<string,{day:string;cars:number;cash:number;card:number;expenses:number;crew:number}>();
 const get=(day:string)=>{let item=map.get(day);if(!item){item={day,cars:0,cash:0,card:0,expenses:0,crew:0};map.set(day,item);}return item;};
 rows.forEach(r=>{const x=get(r.day);x.cars++;x.cash+=r.cash;x.card+=r.card;x.crew+=10;});
 expenses.forEach(e=>get(e.day).expenses+=e.amount);
 return [...map.values()].sort((a,b)=>a.day.localeCompare(b.day));
}
export function demoMonths(rows:DemoRow[],expenses:DemoExpense[]){
 const map=new Map<string,{month:string;cars:number;income:number;expense:number;crew:number}>();
 const get=(day:string)=>{const key=day.slice(0,7);let x=map.get(key);
  if(!x){x={month:key,cars:0,income:0,expense:0,crew:0};map.set(key,x);}return x;};
 rows.forEach(r=>{let x=get(r.day);x.cars++;x.income+=r.cash+r.card;x.crew+=10;});
 expenses.forEach(e=>get(e.day).expense+=e.amount);
 return [...map.values()].sort((a,b)=>b.month.localeCompare(a.month));
}
export function demoCsv(filename:string,rows:(number|string)[][]){
 const csv="\uFEFF"+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=filename;a.click();
 window.setTimeout(()=>URL.revokeObjectURL(url),500);
}
