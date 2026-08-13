import { supabase } from "./supabaseClient";
import { getQueue, removeFromQueue } from "./offlineQueue";

// خطأ اتصال (فقد الشبكة) ما يكون له code من Postgres/PostgREST،
// بعكس أخطاء البيانات الحقيقية (قيد مخالف، عمود ناقص...) يلي دايماً لها code.
export function isNetworkError(error: { code?: string } | null | undefined): boolean {
  return !!error && !error.code;
}

let flushing = false;

export async function flushOfflineQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const queue = getQueue();
    for (const item of queue) {
      const { error } = await supabase.from(item.table).insert(item.payload);
      if (!error || !isNetworkError(error)) {
        // نجح، أو فشل بخطأ بيانات حقيقي مايفيد نعيد المحاولة فيه لاحقاً
        removeFromQueue(item.id);
      } else {
        // لسا فيه مشكلة اتصال، نوقف ونجرب مرة ثانية بعدين
        break;
      }
    }
  } finally {
    flushing = false;
  }
}
