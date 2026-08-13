import { supabase } from "./supabaseClient";

export async function logError(message: string, stack?: string, context?: Record<string, unknown>) {
  try {
    await supabase.from("error_log").insert({
      message: message.slice(0, 2000),
      stack: stack ? stack.slice(0, 4000) : null,
      url: typeof window !== "undefined" ? window.location.href : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      context: context || null,
    });
  } catch {
    // لا نكسر التطبيق لو تسجيل الخطأ نفسه فشل
  }
}
