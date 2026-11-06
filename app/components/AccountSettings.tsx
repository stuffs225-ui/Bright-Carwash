"use client";
import {useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import type {AppIdentity} from "./AuthGate";
export function AccountSettings({identity}:{identity:AppIdentity}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function unpair(){
  if(!window.confirm("إلغاء ربط هذا الجهاز؟ ستحتاج رابط تفعيل مدير جديدًا لإعادة فتح الإدارة."))return;
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/owner/logout",{method:"POST",credentials:"same-origin"});
   if(!res.ok)throw Error("تعذر إلغاء ربط جهاز المدير");
   await supabase.auth.signOut({scope:"local"});
   window.location.replace("/");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنهاء الجلسة");}
  finally{setBusy(false);}
 }
 return <div className="space-y-4" dir="rtl">
  <section className="card space-y-3">
   <h2 className="section-title">جهاز الإدارة</h2>
   <p><strong>صلاحية الحساب:</strong> {identity.role==="manager"?"مدير — جميع الصلاحيات":"عامل"}</p>
   <p><strong>الحالة:</strong> متصل ومعتمد</p>
   <p className="txt-muted text-sm">لا توجد كلمة مرور أو PIN تحتاج إلى إدخالها عند فتح الإدارة من هذا الجهاز. احتفظ بالجهاز في مكان آمن، لأن الوصول إليه يمنح صلاحيات الإدارة.</p>
   <p className="txt-muted text-sm">لإصدار روابط تسجيل سيارات للعمال أو رابط مدير احتياطي، افتح تبويب «روابط العمال» من القائمة الرئيسية.</p>
  </section>
  <section className="card space-y-3">
   <h3 className="subsection-title">أمان الجهاز</h3>
   <p className="txt-muted text-sm">إذا فقدت جهازك أو انتقل إلى شخص آخر، يمكنك إلغاء ربطه. لا تفعل ذلك إلا إذا كان لديك رابط بديل للدخول.</p>
   <button className="btn-secondary w-full" type="button" disabled={busy} onClick={()=>void unpair()}>
    {busy?"جارٍ إلغاء الربط...":"إلغاء ربط هذا الجهاز"}
   </button>
   {error&&<p className="txt-danger" role="alert">{error}</p>}
  </section>
 </div>;
}
