import type { PostgrestError } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 600;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Supabase/PostgREST يرجّع 1000 صف كحد أقصى بكل طلب مهما كانت نتيجة الفلترة.
 * أي استعلام غير محدود بنطاق ضيق (يوم واحد مثلاً) لازم يمرّ من هنا وإلا
 * ينبتر بصمت عند الصف رقم 1000 بدون أي خطأ ظاهر.
 *
 * جدول بـ6000+ صف يحتاج عدة صفحات متتالية، وعلى الجوال (خصوصاً Safari)
 * فشل لحظي بصفحة وحدة كافٍ يفشّل الاستعلام كله برسالة "TypeError: Load
 * failed" — لذا نعيد محاولة كل صفحة بمفردها قبل الاستسلام.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    let lastError: unknown = null;
    let chunk: T[] | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { data, error } = await page(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        chunk = data || [];
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
      }
    }
    if (lastError) throw lastError;
    rows.push(...(chunk as T[]));
    if ((chunk as T[]).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}
