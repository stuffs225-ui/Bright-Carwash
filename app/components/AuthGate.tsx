"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabaseClient";
import { queueLength, setOfflineActor } from "@/lib/offlineQueue";
import { normalizeSaudiMobile } from "@/lib/phone";
import { DemoCarwashApp } from "./DemoCarwashApp";

export type AppRole = "manager" | "worker";
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
    if ((authError || !data.user) && typeof navigator!=="undefined" && !navigator.onLine) {
      // Offline worker access is UI-only using a previously server-verified
      // identity AND a local Supabase auth session. Never unlock management.
      const cached=localStorage.getItem("carwash_verified_worker_v2");
      const {data:sessionData}=await supabase.auth.getSession();
      try {
        const value=cached?JSON.parse(cached):null;
        if(sessionData.session?.user.id===value?.userId && value?.role==="worker"
          && Date.now()-Number(value?.verifiedAt)<14*24*3600*1000) {
          setOfflineActor(value.userId);
          setIdentity({userId:value.userId,email:"حساب العمال — وضع دون إنترنت",role:"worker"});
          setNeedsAccess(false);setLoading(false);return;
        }
      }catch{}
    }
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
    const role:AppRole|null = !member?.active?null:
      member.role==="worker"?"worker":
      member.role==="manager"||member.role==="owner"?"manager":null;
    setOfflineActor(role ? data.user.id : null);
    if(role==="worker"){
      localStorage.setItem("carwash_verified_worker_v2",JSON.stringify({
        userId:data.user.id,role:"worker",verifiedAt:Date.now(),
      }));
    }else localStorage.removeItem("carwash_verified_worker_v2");
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
    localStorage.removeItem("carwash_verified_worker_v2");
    setIdentity(null);
    setNeedsAccess(false);
    setStage("phone"); setOtp("");
  }

  if (!supabaseConfigured) return <DemoCarwashApp />;

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