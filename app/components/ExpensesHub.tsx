"use client";
import {useState} from "react";
import {ExpensesTab} from "./ExpensesTab";
import {InventoryTab} from "./InventoryTab";
type Section="expenses"|"inventory";
export function ExpensesHub(){
 const [tab,setTab]=useState<Section>("expenses");
 return <div className="space-y-4" dir="rtl">
  <nav className="carwash-inner-tabs" aria-label="المصروفات والمخزون">
   <button type="button" className={tab==="expenses"?"active":""}
    aria-current={tab==="expenses"?"page":undefined}
    onClick={()=>setTab("expenses")}>المصروفات</button>
   <button type="button" className={tab==="inventory"?"active":""}
    aria-current={tab==="inventory"?"page":undefined}
    onClick={()=>setTab("inventory")}>المخزون والمواد</button>
  </nav>
  {tab==="expenses"?<ExpensesTab/>:<InventoryTab/>}
 </div>;
}
