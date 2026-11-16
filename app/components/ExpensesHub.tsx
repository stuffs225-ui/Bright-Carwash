"use client";
import {useState} from "react";
import {ExpensesTab} from "./ExpensesTab";
import {InventoryTab} from "./InventoryTab";
import {ExpenseReviewPanel} from "./ExpenseReviewPanel";
type Section="expenses"|"inventory"|"review";
export function ExpensesHub(){
 const [tab,setTab]=useState<Section>(()=>{
  if(typeof window==="undefined")return "expenses";
  const wanted=new URLSearchParams(window.location.search).get("section");
  return wanted==="inventory"?"inventory":wanted==="review"?"review":"expenses";
 });
 return <div className="space-y-4" dir="rtl">
  <nav className="carwash-inner-tabs" aria-label="المصروفات والمخزون">
   <button type="button" className={tab==="expenses"?"active":""}
    aria-current={tab==="expenses"?"page":undefined}
    onClick={()=>setTab("expenses")}>المصروفات</button>
   <button type="button" className={tab==="inventory"?"active":""}
    aria-current={tab==="inventory"?"page":undefined}
    onClick={()=>setTab("inventory")}>المخزون والمواد</button>
   <button type="button" className={tab==="review"?"active":""}
    aria-current={tab==="review"?"page":undefined}
    onClick={()=>setTab("review")}>مراجعة المصروفات</button>
  </nav>
  {tab==="expenses"?<ExpensesTab/>:tab==="inventory"?<InventoryTab/>:<ExpenseReviewPanel/>}
 </div>;
}
