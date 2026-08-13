import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabaseAdmin";

const TABLES = ["entries", "expenses", "car_types", "service_types", "expense_types", "settings"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: settingsRows } = await supabase.from("settings").select("key, value");
  const settingsMap = Object.fromEntries((settingsRows || []).map((r) => [r.key, r.value]));
  const backupEmail = String(settingsMap.backup_email || "Aburaykah@gmail.com");
  const intervalDays = Number(settingsMap.backup_interval_days) || 10;
  const lastSentAt = settingsMap.backup_last_sent_at ? new Date(String(settingsMap.backup_last_sent_at)) : null;

  // ما نرسل إلا لما تمر المدة المحددة بالإعدادات — الـ cron نفسه يشتغل يومياً
  // بس هذا يقرر فعلياً إذا حان وقت الإرسال أو لا.
  if (lastSentAt && Date.now() - lastSentAt.getTime() < intervalDays * DAY_MS) {
    const nextDue = new Date(lastSentAt.getTime() + intervalDays * DAY_MS);
    return NextResponse.json({ ok: true, skipped: true, nextDue: nextDue.toISOString() });
  }

  const dump: Record<string, unknown> = {};
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      return NextResponse.json({ ok: false, error: `${table}: ${error.message}` }, { status: 500 });
    }
    dump[table] = data;
  }

  const json = JSON.stringify(dump, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.json`;

  await supabase.storage.from("backups").upload(filename, json, { contentType: "application/json" });

  const rowCounts = Object.fromEntries(Object.entries(dump).map(([t, rows]) => [t, (rows as unknown[]).length]));

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailError } = await resend.emails.send({
    from: "نظام مغسلة سيارتك اللامعة <onboarding@resend.dev>",
    to: backupEmail,
    subject: `نسخة احتياطية - مغسلة سيارتك اللامعة - ${timestamp.slice(0, 10)}`,
    html: `<div dir="rtl">
      <p>نسخة احتياطية تلقائية مرفقة بهذا الإيميل.</p>
      <ul>${Object.entries(rowCounts).map(([t, c]) => `<li>${t}: ${c} سجل</li>`).join("")}</ul>
    </div>`,
    attachments: [{ filename, content: Buffer.from(json).toString("base64") }],
  });

  if (emailError) {
    return NextResponse.json({ ok: false, error: emailError.message }, { status: 500 });
  }

  await supabase.from("settings").upsert({ key: "backup_last_sent_at", value: new Date().toISOString() });

  return NextResponse.json({ ok: true, filename, rowCounts, sentTo: backupEmail });
}
