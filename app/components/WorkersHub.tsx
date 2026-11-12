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
 </div>;
}
