import type { PostgrestError } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

/**
 * Supabase/PostgREST يرجّع 1000 صف كحد أقصى بكل طلب مهما كانت نتيجة الفلترة.
 * أي استعلام غير محدود بنطاق ضيق (يوم واحد مثلاً) لازم يمرّ من هنا وإلا
 * ينبتر بصمت عند الصف رقم 1000 بدون أي خطأ ظاهر.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}
