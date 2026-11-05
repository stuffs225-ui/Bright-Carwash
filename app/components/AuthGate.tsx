"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabaseClient";
import { queueLength, setOfflineActor } from "@/lib/offlineQueue";
import { normalizeSaudiMobile } from "@/lib/phone";

export type AppRole = "owner" | "manager" | "worker";
export type AppIdentity = { userId: string; email: string; role: AppRole };

export function AuthGate({ children }: { children: (identity: AppIdentity) => React.ReactNode }) {
  const [identity, setIdentity] = useState<AppIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [phone, setPhone] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
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
    setIdentity(role ? { userId: data.user.id, email: data.user.phone || data.user.email || "", role } : null);
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

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeSaudiMobile(phone);
    if (!normalized) { setError("أدخل رقم جوال سعودي صحيحًا مثل 05XXXXXXXX."); return; }
    setSubmitting(true); setError("");
    const { error: sendError } = await supabase.auth.signInWithOtp({
      phone: normalized, options: { channel: "sms", shouldCreateUser: false },
    });
    setSubmitting(false);
    if (sendError) { setError("تعذر إرسال رمز الدخول. تأكد من تفعيل رقمك وإعدادات SMS."); return; }
    setVerifiedPhone(normalized); setOtp(""); setStage("otp");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) { setError("أدخل رمز التحقق المكوّن من 6 أرقام."); return; }
    setSubmitting(true); setError("");
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: verifiedPhone, token: otp, type: "sms",
    });
    setSubmitting(false);
    if (verifyError) { setError("رمز الدخول غير صحيح أو انتهت صلاحيته."); return; }
    await refresh();
  }

  async function signOut() {
    if (queueLength()) {
      setError("يوجد تسجيلات لم تُرفع بعد. اتصل بالإنترنت لتتم المزامنة قبل تسجيل الخروج.");
      return;
    }
    await supabase.auth.signOut({ scope: "local" });
    setIdentity(null);
    setNeedsAccess(false);
    setStage("phone"); setOtp("");
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
            stage === "phone" ? (
              <form onSubmit={requestCode} className="space-y-4">
                <p className="txt-muted">الدخول برقم الجوال ورمز تحقق SMS. تبقى الجلسة محفوظة على الجهاز طالما صالحة.</p>
                <label className="block">رقم الجوال
                  <input className="w-full" type="tel" autoComplete="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
                </label>
                <button className="btn-primary w-full" disabled={submitting} type="submit">{submitting ? "جارٍ إرسال الرمز..." : "إرسال رمز الدخول"}</button>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="space-y-4">
                <p className="txt-muted">أرسلنا رمز تحقق إلى {verifiedPhone}</p>
                <label className="block">رمز التحقق
                  <input className="w-full" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0,6))} placeholder="000000" />
                </label>
                <button className="btn-primary w-full" disabled={submitting} type="submit">{submitting ? "جارٍ التحقق..." : "دخول"}</button>
                <button type="button" className="btn-secondary w-full" onClick={() => { setStage("phone"); setOtp(""); setError(""); }}>تغيير الرقم أو إعادة إرسال الرمز</button>
              </form>
            )
          )}
          {error && <p role="alert" className="txt-danger text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  return <>{children(identity)}</>;
}