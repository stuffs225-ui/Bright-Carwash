"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabaseClient";
import { queueLength, setOfflineActor } from "@/lib/offlineQueue";

export type AppRole = "owner" | "manager" | "worker";
export type AppIdentity = { userId: string; email: string; role: AppRole };

export function AuthGate({ children }: { children: (identity: AppIdentity) => React.ReactNode }) {
  const [identity, setIdentity] = useState<AppIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      setOfflineActor(null);
      setIdentity(null);
      setNeedsAccess(false);
      setLoading(false);
      return;
    }
    const { data: member, error: membershipError } = await supabase
      .from("app_members")
      .select("role, active")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (membershipError) {
      setError("تعذر التحقق من الصلاحيات. راجع إعدادات قاعدة البيانات.");
    }
    const role = member?.active && ["owner", "manager", "worker"].includes(member.role)
      ? member.role as AppRole : null;
    setOfflineActor(role ? data.user.id : null);
    setIdentity(role ? { userId: data.user.id, email: data.user.email || "", role } : null);
    setNeedsAccess(!role);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return; }
    void refresh();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      // Read roles from the DB, never from user-editable metadata.
      void refresh();
    });
    return () => subscription.subscription.unsubscribe();
  }, [refresh]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(), password,
    });
    if (signInError) setError("تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور.");
    else await refresh();
    setSubmitting(false);
  }

  async function signOut() {
    if (queueLength()) {
      setError("يوجد تسجيلات لم تُرفع بعد. اتصل بالإنترنت لتتم المزامنة قبل تسجيل الخروج.");
      return;
    }
    await supabase.auth.signOut();
    setIdentity(null);
    setNeedsAccess(false);
  }

  if (!supabaseConfigured) return <div dir="rtl" className="min-h-screen flex justify-center items-center p-6"><section className="card max-w-md w-full"><h1 className="text-2xl font-bold">مغسلة سيارتك اللامعة — النسخة التجريبية</h1><p className="mt-4 txt-warning">تم تجهيز التطبيق، لكن قاعدة بيانات Supabase المستقلة لم تُربط بعد. تم تعطيل الدخول والتسجيل لمنع الكتابة على أي نظام آخر.</p></section></div>;

  if (loading) return <div dir="rtl" className="min-h-screen flex items-center justify-center p-6">جاري التحقق من الحساب والصلاحيات...</div>;

  if (!identity) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center p-5">
        <div className="card w-full max-w-md space-y-5">
          <h1 className="text-2xl font-bold">مغسلة سيارتك اللامعة</h1>
          {needsAccess ? (
            <>
              <p className="txt-warning">الحساب موجود لكنه غير مُفعّل ضمن طاقم المغسلة. اطلب من صاحب النظام تعيين صلاحيتك.</p>
              <button className="btn-secondary w-full" type="button" onClick={signOut}>تسجيل الخروج</button>
            </>
          ) : (
            <form onSubmit={signIn} className="space-y-4">
              <p className="txt-muted">الدخول مخصص للحسابات التي أنشأها مالك النظام.</p>
              <label className="block">البريد الإلكتروني
                <input className="w-full" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
              </label>
              <label className="block">كلمة المرور
                <input className="w-full" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
              </label>
              <button className="btn-primary w-full" disabled={submitting} type="submit">{submitting ? "جارٍ الدخول..." : "دخول"}</button>
            </form>
          )}
          {error && <p role="alert" className="txt-danger text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  return <>{children(identity)}</>;
}