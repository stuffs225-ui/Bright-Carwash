"use client";
import {useState} from "react";
import {DaySettlementTab} from "./DaySettlementTab";
import {AccountingMonthsTab} from "./AccountingMonthsTab";
export function SettlementHub(){
 const [section,setSection]=useState<"daily"|"monthly">("daily");
 return <div className="space-y-4">
  <nav className="carwash-inner-tabs" aria-label="اعتماد الموازنة">
   <button type="button" className={section==="daily"?"active":""}
     aria-current={section==="daily"?"page":undefined}
     onClick={()=>setSection("daily")}>الموازنة اليومية</button>
   <button type="button" className={section==="monthly"?"active":""}
     aria-current={section==="monthly"?"page":undefined}
     onClick={()=>setSection("monthly")}>الموازنة الشهرية</button>
  </nav>
  {section==="daily"?<DaySettlementTab canApproveVariance/>:<AccountingMonthsTab/>}
 </div>;
}
