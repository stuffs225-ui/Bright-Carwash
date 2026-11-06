"use client";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";

type WorkerLink={id:string;label:string;created_at:string;expires_at:string;revoked_at:string|null;last_used_at:string|null;daily_limit:number};
const date=(s:string)=>new Date(s).toLocaleDateString("ar-SA",{year:"numeric",month:"short",day:"numeric"});
export function UsersTab(){
 const [label,setLabel]=useState("رابط عامل المغسلة");
 const [links,setLinks]=useState<WorkerLink[]>([]);
 const [newUrl,setNewUrl]=useState("");
 const [backupUrl,setBackupUrl]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [status,setStatus]=useState("");
 const request=useCallback(async(endpoint:string,method:"GET"|"POST"|"PATCH",payload?:object)=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw Error("جلسة الإدارة غير متاحة. افتح رابط الإدارة الخاص بجهازك.");
  const response=await fetch(endpoint,{
   method,headers:{"authorization":"Bearer "+session.access_token,"content-type":"application/json"},
   body:payload?JSON.stringify(payload):undefined,cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"تعذر تنفيذ الطلب");
  return data;
 },[]);
 const refresh=useCallback(async()=>{
  try{
   const response=await request("/api/worker-links","GET");
   setLinks(response.links||[]);
  }catch(e){setError(e instanceof Error?e.message:"تعذر جلب الروابط");}
 },[request]);
 useEffect(()=>{void refresh();},[refresh]);

 async function makeLink(e:React.FormEvent){
  e.preventDefault();setBusy(true);setStatus("");setError("");
  try{
   const response=await request("/api/worker-links","POST",{label:label.trim()});
   setNewUrl(response.url);
   setStatus("تم إصدار رابط العامل. انسخه وأرسله للعامل عبر واتساب، بدون أي تسجيل دخول.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الرابط");}
  finally{setBusy(false);}
 }
 async function revoke(id:string){
  if(!window.confirm("إلغاء هذا الرابط؟ لن يتمكن العامل من تسجيل سيارات جديدة باستخدامه."))return;
  setBusy(true);setError("");setStatus("");
  try{
   await request("/api/worker-links","PATCH",{id,action:"revoke"});
   setNewUrl("");setStatus("تم إلغاء الرابط فورًا.");await refresh();
  }catch(e){setError(e instanceof Error?e.message:"تعذر الإلغاء");}
  finally{setBusy(false);}
 }
 async function copy(text:string){
  try{await navigator.clipboard.writeText(text);setStatus("تم نسخ الرابط. يمكنك إرساله في واتساب.");}
  catch{setError("تعذر النسخ تلقائيًا؛ اضغط مطولًا على حقل الرابط وانسخه.");}
 }
 async function share(text:string){
  try{
   if(typeof navigator.share==="function")await navigator.share({
    title:"مغسلة سيارتك اللامعة — تسجيل السيارات",url:text
   });
   else await copy(text);
  }catch{}
 }
 async function createOwnerBackup(){
  setBusy(true);setError("");setStatus("");
  try{
   const data=await request("/api/owner/invites","POST");
   setBackupUrl(data.url);
   setStatus("تم إنشاء رابط إدارة مباشر يعمل من أي جهاز دون تفعيل، ويمكن فتحه أكثر من مرة.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الرابط الاحتياطي");}
  finally{setBusy(false);}
 }
 return <div className="space-y-5" dir="rtl">
  <section className="card space-y-4">
   <h2 className="section-title">🔗 روابط تسجيل السيارات للعمال</h2>
   <p className="txt-muted text-sm">أنشئ رابطًا خاصًا وأرسله للعامل. يفتح نموذج إضافة السيارات فقط، بدون حساب، إيميل أو PIN. لا يستطيع رؤية الإدارة أو بيانات الحسابات.</p>
   <form onSubmit={makeLink} className="space-y-3">
    <label className="form-label">اسم الرابط (لتمييز العامل أو الوردية)
     <input value={label} maxLength={80} required onChange={e=>setLabel(e.target.value)}
      placeholder="مثلًا: العامل الصباحي"/>
    </label>
    <button type="submit" className="btn-primary w-full" disabled={busy}>
     {busy?"جارٍ إنشاء الرابط...":"إنشاء رابط العامل"}
    </button>
   </form>
   {newUrl&&<div className="space-y-3 p-3 border rounded-xl">
    <strong>رابط العامل الجديد — انسخه الآن</strong>
    <input aria-label="رابط العامل" type="text" readOnly value={newUrl} onFocus={e=>e.currentTarget.select()} dir="ltr"/>
    <div className="grid grid-cols-2 gap-2">
     <button type="button" className="btn-primary" onClick={()=>void copy(newUrl)}>نسخ الرابط</button>
     <button type="button" className="btn-secondary" onClick={()=>void share(newUrl)}>مشاركة الرابط</button>
    </div>
    <p className="txt-muted text-xs">الرابط سري، ومن يمتلكه يستطيع تسجيل السيارات فقط. صالح لمدة 90 يومًا ويمكن إلغاؤه فورًا.</p>
   </div>}
  </section>
  {error&&<p className="txt-danger" role="alert">{error}</p>}
  {status&&<p role="status" className="text-green-700">{status}</p>}
  <section className="card space-y-3">
   <h2 className="section-title">روابط العامل ({links.length})</h2>
   {links.length===0?<p className="txt-muted text-sm">لم تُنشأ روابط حتى الآن.</p>:
    links.map(link=>{
     const active=!link.revoked_at&&new Date(link.expires_at).getTime()>Date.now();
     return <div key={link.id} className="flex items-center justify-between gap-2 border rounded-xl p-3">
      <div><strong>{link.label}</strong>
       <p className="txt-muted text-xs">{active?"نشط":"ملغى أو منتهي"} · حتى {date(link.expires_at)}</p>
       {link.last_used_at&&<p className="txt-muted text-xs">آخر تسجيل: {date(link.last_used_at)}</p>}
      </div>
      {active&&<button type="button" className="btn-secondary" disabled={busy}
        onClick={()=>void revoke(link.id)}>إلغاء الرابط</button>}
     </div>;
    })}
  </section>
  <section className="card space-y-3">
   <h2 className="subsection-title">رابط مباشر إضافي للإدارة</h2>
   <p className="txt-muted text-sm">رابط الإدارة الخاص يفتح اللوحة كاملة مباشرة، دون تسجيل أو تفعيل، على أي جوال أو كمبيوتر. لا ترسله للعمال لأنه يمنح جميع صلاحيات المدير.</p>
   <button className="btn-secondary w-full" type="button" disabled={busy}
    onClick={()=>void createOwnerBackup()}>إنشاء رابط إدارة مباشر إضافي</button>
   {backupUrl&&<div className="space-y-2">
    <input aria-label="رابط الإدارة الاحتياطي" type="text" dir="ltr" readOnly value={backupUrl}
      onFocus={e=>e.currentTarget.select()}/>
    <button type="button" className="btn-secondary w-full" onClick={()=>void copy(backupUrl)}>نسخ الرابط الاحتياطي</button>
    <p className="txt-warning text-xs">رابط سري يمنح جميع صلاحيات الإدارة، يمكن استخدامه عدة مرات ومن أي جهاز. احفظه بعيدًا عن الآخرين.</p>
   </div>}
  </section>
 </div>;
}
