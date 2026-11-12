"use client";
import {useState} from "react";
import {WorkersTab} from "./WorkersTab";
import {CrewBonusesTab} from "./CrewBonusesTab";

type Section="workers"|"bonuses";
export function WorkersHub(){
 const [view,setView]=useState<Section>("workers");
 return <div className="space-y-3" dir="rtl">
  <nav className="carwash-inner-tabs" aria-label="العمال والرواتب">
   <button type="button" className={view==="workers"?"active":""}
    aria-current={view==="workers"?"page":undefined}
    onClick={()=>setView("workers")}>العمال والحسابات</button>
   <button type="button" className={view==="bonuses"?"active":""}
    aria-current={view==="bonuses"?"page":undefined}
    onClick={()=>setView("bonuses")}>مكافآت الفريق</button>
  </nav>
  <div hidden={view!=="workers"}><WorkersTab/></div>
  {view==="bonuses"&&<CrewBonusesTab/>}
  <details className="rounded-xl border p-3 text-sm" style={{borderColor:"var(--border)"}}>
   <summary className="cursor-pointer txt-muted">كيف تُحسب عشرات الغسيل؟</summary>
   <p className="mt-2">يُحسب 10 ر.س للفريق ككل لكل سيارة مؤهلة، ويظهر كمصروف تلقائي.
    لا تُضاف العشرات لرصيد عامل فردي ولا تُعد دفعة نقدية قبل تسجيل الصرف.</p>
  </details>
 </div>;
}
