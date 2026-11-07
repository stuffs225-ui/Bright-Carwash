"use client";

import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {showToast} from "@/lib/toast";
import {formatCurrency} from "@/lib/business";
import {riyadhDate} from "@/lib/expenseDates";
import {ArabicDateField,arabicDate} from "./ArabicDateField";

type CrewBonus = {id:string;shift_date:string;amount:number;reason:string;created_at:string;deleted_at:string|null};

/** Manager gives extra collective crew bonus; not a cash wage payment. */
export function CrewBonusesTab() {
  const [day,setDay]=useState(riyadhDate);
  const [amount,setAmount]=useState("");
  const [reason,setReason]=useState("");
  const [items,setItems]=useState<CrewBonus[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const refresh=useCallback(async()=>{
    const {data,error}=await supabase.from("crew_shift_bonuses")
      .select("id,shift_date,amount,reason,created_at,deleted_at")
      .order("created_at",{ascending:false}).limit(100);
    if(error) { setError("تعذر قراءة مكافآت الفريق: "+error.message);return; }
    setItems((data||[]) as CrewBonus[]);setError("");
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function add(e:React.FormEvent){
    e.preventDefault();
    const value=Number(amount);
    if(!Number.isFinite(value)||value<=0||Math.round(value*100)!==Math.round(value*10000)/100){
      showToast("اكتب مكافأة مالية صحيحة.", "warning");return;
    }
    if(reason.trim().length<5){showToast("اكتب سببًا واضحًا للمكافأة.","warning");return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){showToast("تحقق من تسجيل الدخول.","error");return;}
    setLoading(true);
    const {error}=await supabase.from("crew_shift_bonuses").insert({
      shift_date:day,amount:value,reason:reason.trim(),created_by:user.id,
    });
    setLoading(false);
    if(error){showToast("لم تحفظ المكافأة: "+error.message,"error");return;}
    setAmount("");setReason("");showToast("تم حفظ مكافأة الفريق، وهي مستحق وليست دفعًا نقديًا.");void refresh();
  }
  async function voidBonus(id:string){
    if(!confirm("إلغاء هذه المكافأة؟ سيبقى سجل التغيير محفوظًا."))return;
    const {error}=await supabase.from("crew_shift_bonuses")
      .update({deleted_at:new Date().toISOString()}).eq("id",id);
    if(error){showToast(error.message,"error");return;}
    showToast("تم إلغاء المكافأة مع الاحتفاظ بسجل التعديل.");void refresh();
  }
  return <div className="space-y-6">
    <section className="card">
      <h2 className="section-title">مكافأة إضافية لفريق الوردية</h2>
      <p className="txt-muted text-sm">مخصص العمال الأساسي 10 ريالات إجمالًا لكل سيارة. وهذه المكافأة الإضافية منفصلة وتُضاف إلى مستحقات الفريق، ولا تعني صرفها نقدًا. مكافأة ريالين القديمة مجمّدة.</p>
      <form className="space-y-4 mt-4" onSubmit={add}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="form-label">تاريخ الوردية
            <ArabicDateField value={day} onChange={setDay} ariaLabel="تاريخ الوردية" max={riyadhDate()}/>
          </label>
          <label className="form-label">مكافأة الفريق (ر.س)
            <input type="number" min="0.01" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} />
          </label>
        </div>
        <label className="form-label">السبب
          <textarea required rows={2} value={reason} onChange={e=>setReason(e.target.value)} placeholder="مثلاً التزام الفريق وجودة الخدمة" />
        </label>
        <button className="btn-primary w-full" disabled={loading} type="submit">إضافة مكافأة الوردية</button>
      </form>
    </section>
    <section className="card">
      <h2 className="section-title">سجل المكافآت الإضافية</h2>
      {error&&<p className="txt-danger text-sm">{error}</p>}
      {items.filter(x=>!x.deleted_at).length===0
        ? <p className="txt-muted">لا توجد مكافآت مسجلة.</p>
        : <div className="space-y-3">{items.filter(x=>!x.deleted_at).map(x=><div key={x.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <span>{arabicDate(x.shift_date)} — {formatCurrency(x.amount)} — {x.reason}</span>
          <button type="button" className="btn-secondary" onClick={()=>void voidBonus(x.id)}>إلغاء مع حفظ الأثر</button>
        </div>)}</div>}
    </section>
  </div>;
}
