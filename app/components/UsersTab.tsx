"use client";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";

type Member={user_id:string;email:string|null;role:"worker";active:boolean;created_at:string};
export function UsersTab(){
 const [members,setMembers]=useState<Member[]>([]);
 const [email,setEmail]=useState("");
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");

 const request=useCallback(async(method:"GET"|"POST"|"PATCH",body?:object)=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw Error("انتهت الجلسة، سجّل الدخول مجددًا");
  const res=await fetch("/api/users",{
   method,headers:{"authorization":"Bearer "+session.access_token,"content-type":"application/json"},
   body:body?JSON.stringify(body):undefined,cache:"no-store"
  });
  const payload=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(payload.error||"فشل الطلب");
  return payload;
 },[]);

 const refresh=useCallback(async()=>{
  try{const result=await request("GET");setMembers(result.members||[]);}
  catch(e){setError(e instanceof Error?e.message:"تعذرت قراءة الحسابات");}
 },[request]);
 useEffect(()=>{void refresh();},[refresh]);

 async function addWorker(e:React.FormEvent){
  e.preventDefault();setSaving(true);setError("");setSuccess("");
  try{
   const address=email.trim().toLowerCase();
   if(!/^\S+@\S+\.\S+$/.test(address))throw Error("أدخل إيميل العامل الصحيح");
   await request("POST",{email:address,role:"worker"});
   setEmail("");
   setSuccess("تم إنشاء حساب العامل. يفتح العامل صفحة الدخول، يختار «أول مرة أو نسيت PIN»، ويتحقق من الإيميل ليختار رمزه بنفسه.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"تعذرت إضافة العامل");}
  finally{setSaving(false);}
 }
 async function update(member:Member,active:boolean){
  setSaving(true);setError("");setSuccess("");
  try{
   await request("PATCH",{user_id:member.user_id,role:"worker",active});
   setSuccess(active?"تم تفعيل حساب العامل.":"تم إيقاف حساب العامل.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحديث الحالة");}
  finally{setSaving(false);}
 }

 return <div className="space-y-5" dir="rtl">
  <section className="card space-y-3">
   <h2 className="section-title">إدارة حساب العامل</h2>
   <p className="txt-muted text-sm">الدخول للإدارة والعامل بالإيميل وPIN من 4 أرقام. حساب العامل محدود الصلاحيات، ويمكنه إعداد الرمز أو استعادته عبر بريده بنفسه، دون جوال.</p>
   <form onSubmit={addWorker} className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
    <label className="form-label">الإيميل المخصص للعامل
     <input type="email" inputMode="email" autoComplete="off" required
      value={email} onChange={e=>setEmail(e.target.value)} placeholder="worker@example.com"/>
    </label>
    <div className="flex items-end"><button className="btn-primary w-full" type="submit" disabled={saving}>
     {saving?"جارٍ الحفظ...":"إضافة حساب العامل"}
    </button></div>
   </form>
   <p className="txt-muted text-xs">يبقى نظام الحساب المشترك للعاملين كما كان: حساب عامل نشط واحد في الوقت نفسه.</p>
  </section>
  {error&&<p role="alert" className="txt-danger">{error}</p>}
  {success&&<p role="status" className="text-green-700">{success}</p>}
  <section className="card">
   <h2 className="section-title mb-3">الحسابات ({members.length})</h2>
   <div className="overflow-x-auto"><table className="app-table">
    <thead><tr><th>الإيميل</th><th>الدور</th><th>الحالة</th><th>الإجراء</th></tr></thead>
    <tbody>{members.map(m=><tr key={m.user_id}>
     <td>{m.email||"البريد غير متوفر"}</td><td>عامل</td>
     <td>{m.active?"نشط":"متوقف"}</td>
     <td><button type="button" className="btn-secondary" disabled={saving}
      onClick={()=>void update(m,!m.active)}>{m.active?"تعطيل":"تفعيل"}</button></td>
    </tr>)}</tbody>
   </table></div>
  </section>
 </div>;
}
