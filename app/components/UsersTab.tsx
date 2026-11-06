"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Role = "manager" | "worker";
type Member = { user_id:string; phone:string|null; role:Role; active:boolean; created_at:string };
const ROLE_LABEL:Record<Role,string> = {manager:"مدير",worker:"عامل"};
const roles:Role[] = ["worker"];

export function UsersTab() {
  const [members,setMembers] = useState<Member[]>([]);
  const [phone,setPhone] = useState("");
  const [initialPin,setInitialPin]=useState("");
  const [role,setRole] = useState<Role>("worker");
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");

  const request = useCallback(async (method:"GET"|"POST"|"PATCH", body?:object) => {
    const {data:{session}} = await supabase.auth.getSession();
    if(!session) throw new Error("انتهت صلاحية تسجيل الدخول");
    const res = await fetch("/api/users", {
      method, headers:{"authorization":"Bearer "+session.access_token,"content-type":"application/json"},
      body:body?JSON.stringify(body):undefined,
      cache:"no-store",
    });
    const payload = await res.json();
    if(!res.ok) throw new Error(payload.error || "فشل الطلب");
    return payload;
  },[]);

  const refresh = useCallback(async () => {
    try {
      const result = await request("GET");
      setMembers(result.members || []);
    } catch (e) {
      setError(e instanceof Error?e.message:String(e));
    }
  },[request]);
  useEffect(()=>{void refresh();},[refresh]);

  async function invite(e:React.FormEvent) {
    e.preventDefault(); setSaving(true);setError("");setSuccess("");
    try {
      if(!/^\d{4}$/.test(initialPin))throw Error("أدخل رمز العامل الأولي من أربعة أرقام");
      await request("POST",{phone,role:"worker",pin:initialPin});
      setSuccess("تم تفعيل رقم الجوال وصلاحية الحساب؛ يستطيع المستخدم طلب رمز SMS عند الدخول.");
      setPhone("");setInitialPin("");await refresh();
    } catch(e) {setError(e instanceof Error?e.message:String(e));}
    finally {setSaving(false);}
  }

  async function update(member:Member, patch:Partial<Member>) {
    setSaving(true);setError("");setSuccess("");
    try {
      await request("PATCH",{user_id:member.user_id,role:patch.role??member.role,active:patch.active??member.active});
      setSuccess("تم تحديث الصلاحية.");await refresh();
    } catch(e) {setError(e instanceof Error?e.message:String(e));}
    finally {setSaving(false);}
  }

  return <div className="space-y-5" dir="rtl">
    <section className="card">
      <h2 className="section-title">إدارة المستخدمين والصلاحيات</h2>
      <p className="txt-muted text-sm">أضف رقم الجوال المشترك للعاملين، وحدد رمزًا أوليًا من 4 أرقام. لا يظهر الرمز بعد حفظه؛ يستطيع العامل تغييره من معلومات الحساب. يمكن تفعيل حساب عامل واحد فقط في الوقت نفسه.</p>
      <form onSubmit={invite} className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <label className="form-label">رقم الجوال
          <input type="tel" required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="05XXXXXXXX" />
        </label>
        <label className="form-label">رمز العامل الأولي (4 أرقام)
          <input type="password" inputMode="numeric" autoComplete="new-password"
            required maxLength={4} pattern="[0-9]{4}"
            value={initialPin} onChange={e=>setInitialPin(e.target.value.replace(/\D/g,"").slice(0,4))}
            placeholder="••••" />
        </label>
        <div className="flex items-end"><button type="submit" disabled={saving} className="btn-primary w-full">إضافة حساب الجوال</button></div>
      </form>
    </section>
    {error && <p role="alert" className="txt-danger">{error}</p>}
    {success && <p role="status" className="text-green-700">{success}</p>}
    <section className="card">
      <h2 className="section-title mb-3">حسابات المغسلة ({members.length})</h2>
      <div className="overflow-x-auto"><table className="app-table">
        <thead><tr><th>المستخدم</th><th>الدور</th><th>الحالة</th><th>الإجراء</th></tr></thead>
        <tbody>{members.map(m=><tr key={m.user_id}>
          <td>{m.phone||m.user_id.slice(0,8)}</td>
          <td>
            <strong>{ROLE_LABEL[m.role]}</strong>
          </td>
          <td>{m.active?"نشط":"موقف"}</td>
          <td><button type="button" disabled={saving} className="btn-secondary" onClick={()=>void update(m,{active:!m.active})}>{m.active?"تعطيل":"تفعيل"}</button></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
