"use client";
import {useState} from "react";
import {WorkersTab} from "./WorkersTab";
import {CrewBonusesTab} from "./CrewBonusesTab";

type Section="workers"|"dues"|"payments"|"bonuses"|"statements";
const items:{key:Section;label:string}[]=[
 {key:"workers",label:"العمال"},
 {key:"dues",label:"المستحقات والرواتب"},
 {key:"payments",label:"الدفعات والسلف"},
 {key:"bonuses",label:"المكافآت"},
 {key:"statements",label:"كشوف الحساب"},
];
export function WorkersHub(){
 const [view,setView]=useState<Section>("workers");
 return <div className="space-y-4">
  <section className="card space-y-2"><h2 className="font-bold">أجور الغسيل الجماعية (العشرات)</h2><p className="txt-muted text-sm">10 ريالات لكل سيارة صغيرة أو كبيرة، تُسجل تلقائيًا ضمن المصروفات باسم أجور العمال لكل يوم. لا تُوزع على حسابات الأفراد ولا تُعتبر دفعة نقدية تلقائيًا. السلف والمكافآت والدفعات الخاصة تسجل في حساب العامل من الأقسام أدناه.</p></section>
  <nav className="carwash-inner-tabs" aria-label="العمال والرواتب">
   {items.map(i=><button type="button" key={i.key}
    aria-current={view===i.key?"page":undefined}
    className={view===i.key?"active":""} onClick={()=>setView(i.key)}>{i.label}</button>)}
  </nav>
  {view==="bonuses"?<CrewBonusesTab/>:<WorkersTab view={view}/>}
 </div>;
}
