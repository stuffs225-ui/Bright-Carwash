import "server-only";
import { createClient } from "@supabase/supabase-js";

// عميل بصلاحيات كاملة (service role) — يُستخدم فقط داخل Route Handlers على
// السيرفر (زي النسخ الاحتياطي)، وممنوع استيراده من أي كود يعمل بالمتصفح.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
