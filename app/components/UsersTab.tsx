"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabaseClient";

type WorkerLink={
 id:string;label:string;created_at:string;expires_at:string;revoked_at:string|null;
 last_used_at:string|null;daily_limit:number;url:string|null;
 recoverable:boolean;recoveryFailed:boolean;
};
const date=(s:string)=>new Date(s).toLocaleDateString(
 "ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"short",day:"numeric"});
const active=(link:WorkerLink)=>!link.revoked_at&&Date.parse(link.expires_at)>Date.now();

export function UsersTab(){
 const [label,setLabel]=useState("الرابط المشترك لجميع العمال");
 const [links,setLinks]=useState<WorkerLink[]>([]);
 const [ownerUrl,setOwnerUrl]=useState("");
 const [ownerLoading,setOwnerLoading]=useState(true);
 const [ownerLegacy,setOwnerLegacy]=useState(0);
 const [ownerRecoveryFailed,setOwnerRecoveryFailed]=useState(false);
 const [justCreatedUrl,setJustCreatedUrl]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [status,setStatus]=useState("");
 const [editingName,setEditingName]=useState(false);
 const [newName,setNewName]=useState("");
 const request=useCallback(async(endpoint:string,method:"GET"|"POST"|"PATCH",payload?:object)=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw Error("جلسة الإدارة غير متاحة. افتح رابط الإدارة الخاص بجهازك.");
  const response=await fetch(endpoint,{
   method,headers:{authorization:"Bearer "+session.access_token,
    "content-type":"application/json"},
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
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"تعذر جلب الروابط");}
  finally{setLoading(false);}
 },[request]);
 useEffect(()=>{void refresh();},[refresh]);
 const current=useMemo(()=>links.find(active)||null,[links]);
 const history=useMemo(()=>links.filter(x=>x.id!==current?.id),[links,current?.id]);
 async function issue(replace=false){
  if(busy)return;
  if(replace&&!window.confirm(
   "هل تريد استبدال الرابط المشترك؟ سيُوقف الرابط السابق عند نجاح إصدار الجديد. يجب إرسال الرابط الجديد للعمال، وستظل السيارات المسجلة محفوظة."
  ))return;
  setBusy(true);setStatus("");setError("");
  try{
   const response=await request("/api/worker-links","POST",{label:replace?current?.label||label:label.trim(),replace});
   if(typeof response.url==="string")setJustCreatedUrl(response.url);
   setEditingName(false);
   await refresh();
   setStatus(replace
    ?"تم إنشاء رابط جديد محفوظ في الإعدادات. الرابط السابق أُلغي؛ أرسل الرابط الجديد لجميع العمال."
    :"تم إنشاء الرابط وحفظه مشفرًا. يمكنك الرجوع لنسخه من هذه الصفحة متى شئت.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الرابط");}
  finally{setBusy(false);}
 }
 async function revoke(link:WorkerLink){
  if(!window.confirm("إلغاء الرابط؟ لن يتمكن أي عامل من التسجيل به، وسيبقى السجل محفوظًا."))return;
  setBusy(true);setError("");setStatus("");
  try{
   await request("/api/worker-links","PATCH",{id:link.id,action:"revoke"});
   setJustCreatedUrl("");
   await refresh();setStatus("تم إلغاء الرابط؛ السجلات والعمليات السابقة محفوظة.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر الإلغاء");}
  finally{setBusy(false);}
 }
 async function rename(){
  if(!current||busy||!newName.trim()||newName.trim().length>80)return;
  setBusy(true);setError("");
  try{
   await request("/api/worker-links","PATCH",{id:current.id,action:"rename",label:newName.trim()});
   await refresh();setEditingName(false);setStatus("تم تعديل اسم الرابط دون تغيير عنوانه.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل الاسم");}
  finally{setBusy(false);}
 }
 async function copy(url:string){
  try{
   await navigator.clipboard.writeText(url);
   setStatus("تم نسخ الرابط ويمكنك إرساله للعامل.");setError("");
  }catch{setError("تعذر النسخ تلقائيًا؛ اضغط مطولًا على حقل الرابط وانسخه.");}
 }
 async function share(url:string){
  try{
   if(typeof navigator.share==="function")
    await navigator.share({title:"مغسلة سيارتك اللامعة — رابط خاص",url});
   else await copy(url);
  }catch{}
 }
 const refreshOwner=useCallback(async()=>{
  try{
   const data=await request("/api/owner/invites","GET");
   setOwnerUrl(typeof data.url==="string"?data.url:"");
   setOwnerLegacy(Number(data.legacyActiveCount||0));
   setOwnerRecoveryFailed(data.recoveryFailed===true);
  }catch(e){setError(e instanceof Error?e.message:"تعذر قراءة رابط الإدارة");}
  finally{setOwnerLoading(false);}
 },[request]);
 useEffect(()=>{void refreshOwner();},[refreshOwner]);
 async function createOwnerLink(replace=false){
  if(busy)return;
  if(replace&&!window.confirm(
   "استبدال روابط الإدارة السابقة؟ سيتم إلغاء الروابط القديمة ولن تعمل على الأجهزة الجديدة. ستبقى الجلسات المرتبطة سابقًا والعمليات المالية دون تغيير. احفظ الرابط الجديد جيدًا."
  ))return;
  setBusy(true);setError("");setStatus("");
  try{
   const data=await request("/api/owner/invites","POST",{replace});
   setOwnerUrl(data.url);
   await refreshOwner();
   setStatus(replace?"تم استبدال الروابط القديمة وحفظ رابط إدارة واحد قابل للاسترجاع.":"الرابط الحالي محفوظ؛ يمكنك نسخه وفتحه من أي جهاز.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ رابط الإدارة");}
  finally{setBusy(false);}
 }
 return <div className="space-y-4" dir="rtl" data-testid="worker-link-settings">
  <section className="card space-y-3" data-testid="saved-manager-link">
   <div>
    <h2 className="section-title mb-1">🔐 رابط الإدارة الثابت</h2>
    <p className="txt-muted text-xs">رابط خاص بالمدير، يفتح جميع الصلاحيات على أي جهاز دون كتابة إيميل أو كلمة مرور. احتفظ به لنفسك؛ من يمتلكه يستطيع الدخول للإدارة.</p>
   </div>
   {ownerLoading?<p className="txt-muted text-sm">جارٍ استرجاع رابط الإدارة...</p>:
    ownerUrl?<div className="space-y-3">
     <label className="form-label">رابط الإدارة الحالي — محفوظ ويمكن نسخه دائمًا
      <input readOnly type="text" dir="ltr" aria-label="رابط الإدارة الحالي"
       autoComplete="off" value={ownerUrl} onFocus={e=>e.currentTarget.select()}/>
     </label>
     <div className="grid grid-cols-2 gap-2">
      <button type="button" className="btn-primary" onClick={()=>void copy(ownerUrl)}>نسخ رابط الإدارة</button>
      <button type="button" className="btn-secondary" onClick={()=>void share(ownerUrl)}>مشاركة الرابط</button>
     </div>
     <button type="button" className="btn-secondary w-full"
      onClick={()=>window.open(ownerUrl,"_blank","noopener,noreferrer")}>فتح لوحة الإدارة من الرابط</button>
    </div>:<div className="space-y-2">
     <p className="txt-warning text-sm">
      {ownerRecoveryFailed?"تعذر فك تشفير رابط الإدارة السابق.":
       ownerLegacy>0?"روابط الإدارة القديمة كانت محفوظة كبصمة فقط، ولا يمكن استرجاع عنوانها.":"لا يوجد رابط إدارة محفوظ حتى الآن."}
     </p>
     <button className="btn-primary w-full" type="button" disabled={busy}
      onClick={()=>void createOwnerLink(ownerLegacy>0||ownerRecoveryFailed)}>
      {ownerLegacy>0||ownerRecoveryFailed?"استبدال الروابط القديمة برابط إدارة محفوظ":"إنشاء رابط إدارة ثابت"}
     </button>
    </div>}
   <details className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
    <summary className="cursor-pointer font-semibold text-sm">إدارة الرابط وتغييره</summary>
    <div className="space-y-2 mt-3">
     <p className="txt-muted text-xs">لا تحتاج إلى استبدال الرابط لمجرد ضياعه؛ استخدم النسخ من أعلى. استبدله فقط إذا وصل لشخص آخر.</p>
     {ownerUrl&&<button className="btn-secondary w-full" type="button" disabled={busy}
      onClick={()=>void createOwnerLink(true)}>إلغاء الروابط القديمة وإصدار رابط جديد</button>}
    </div>
   </details>
  </section>
  <section className="card space-y-4">
   <div>
    <h2 className="section-title mb-1">🔗 رابط تسجيل السيارات المشترك</h2>
    <p className="txt-muted text-sm">رابط واحد تشاركه مع جميع العمال. لا يتطلب حسابًا ولا يفتح صفحة الإدارة.</p>
   </div>
   {loading&&<p role="status" className="txt-muted">جارٍ تحميل الرابط...</p>}
   {!loading&&!current&&<>
    <label className="form-label">اسم الرابط
     <input value={label} maxLength={80} required
      onChange={e=>setLabel(e.target.value)} placeholder="الرابط المشترك لجميع العمال"/>
    </label>
    <button type="button" className="btn-primary w-full"
     disabled={busy||!label.trim()} onClick={()=>void issue(false)}>
     {busy?"جارٍ الإنشاء...":"إنشاء رابط العمال وحفظه"}
    </button>
   </>}
   {current&&<div className="rounded-xl border p-3 space-y-3"
    style={{borderColor:"var(--border)"}} data-testid="current-worker-link">
    <div className="flex justify-between gap-3 items-start">
     <div><strong className="block">{current.label}</strong>
      <p className="txt-muted text-xs">نشط حتى {date(current.expires_at)}</p></div>
     <span className="text-xs txt-cash font-semibold shrink-0">نشط</span>
    </div>
    {current.url?<>
     <label className="form-label">رابط العامل الحالي — يمكنك الرجوع إليه دائمًا
      <input aria-label="رابط العامل الحالي" type="text" readOnly dir="ltr"
       autoComplete="off" value={current.url} onFocus={e=>e.currentTarget.select()}/>
     </label>
     <div className="grid grid-cols-2 gap-2">
      <button type="button" className="btn-primary" onClick={()=>void copy(current.url!)}>نسخ الرابط</button>
      <button type="button" className="btn-secondary" onClick={()=>void share(current.url!)}>مشاركة الرابط</button>
     </div>
     <button type="button" className="btn-secondary w-full"
      onClick={()=>window.open(current.url!,"_blank","noopener,noreferrer")}>فتح صفحة العامل</button>
    </>:<div className="space-y-3">
     <p className="txt-warning text-sm" role="status">
      {current.recoveryFailed
       ?"تعذر فك تشفير الرابط المحفوظ. يمكن استبداله دون المساس بالسيارات المسجلة."
       :"هذا الرابط قديم وأنشئ قبل تفعيل حفظ الروابط. لم يكن عنوانه محفوظًا، لذلك لا يمكن استرجاعه، لكنه ما زال يعمل مع العمال الذين لديهم نسخته."}
     </p>
     <button type="button" className="btn-primary w-full" disabled={busy}
      onClick={()=>void issue(true)}>استبداله برابط محفوظ قابل للنسخ دائمًا</button>
    </div>}
    <details className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
     <summary className="cursor-pointer font-semibold text-sm">إدارة الرابط وتغييره</summary>
     <div className="space-y-3 mt-3">
      {editingName?<div className="space-y-2">
       <label className="form-label">اسم الرابط
        <input autoFocus value={newName} maxLength={80} onChange={e=>setNewName(e.target.value)}/>
       </label>
       <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary" disabled={busy||!newName.trim()}
         onClick={()=>void rename()}>حفظ الاسم</button>
        <button type="button" className="btn-secondary" onClick={()=>setEditingName(false)}>إلغاء</button>
       </div>
      </div>:<button type="button" className="btn-secondary w-full"
       disabled={busy} onClick={()=>{setNewName(current.label);setEditingName(true);}}>
       تعديل اسم الرابط فقط
      </button>}
      {current.url&&<button type="button" className="btn-secondary w-full"
       disabled={busy} onClick={()=>void issue(true)}>استبدال الرابط بعنوان جديد</button>}
      <button type="button" className="btn-secondary w-full" disabled={busy}
       onClick={()=>void revoke(current)}>إلغاء الرابط الحالي</button>
     </div>
    </details>
   </div>}
   {justCreatedUrl&&justCreatedUrl!==current?.url&&<div
    className="rounded-xl border p-3 space-y-2" style={{borderColor:"var(--border)"}}>
    <strong className="text-sm">الرابط الجديد — متاح للنسخ حتى لو تعذر تحديث القائمة</strong>
    <input type="text" readOnly dir="ltr" aria-label="الرابط الجديد"
     value={justCreatedUrl} onFocus={e=>e.currentTarget.select()}/>
    <button type="button" className="btn-primary w-full"
     onClick={()=>void copy(justCreatedUrl)}>نسخ الرابط الجديد</button>
   </div>}
   <p className="txt-muted text-xs">الرابط سري وصالح لمدة 90 يومًا عند إصداره. من يمتلكه يستطيع تسجيل السيارات فقط؛ لا ترسله لغير العمال.</p>
  </section>
  {error&&<p className="txt-danger text-sm" role="alert">{error}</p>}
  {status&&<p className="txt-cash text-sm" role="status">{status}</p>}
  <details className="card" data-testid="worker-link-history">
   <summary className="font-bold cursor-pointer">سجل الروابط السابقة ({history.length})</summary>
   <div className="space-y-2 mt-4">
    {history.length===0?<p className="txt-muted text-sm">لا توجد روابط سابقة.</p>:
     history.map(link=><div key={link.id}
      className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
      <strong className="block">{link.label}</strong>
      <p className="txt-muted text-xs">{link.revoked_at?"ملغى":"منتهي"} · حتى {date(link.expires_at)}</p>
      {link.last_used_at&&<p className="txt-muted text-xs">آخر تسجيل: {date(link.last_used_at)}</p>}
     </div>)}
   </div>
  </details>
 </div>;
}
