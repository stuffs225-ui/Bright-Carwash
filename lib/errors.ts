// أخطاء Supabase (PostgrestError) كائنات عادية {message, details, hint, code} —
// مو instanceof Error، فـ String(err) عليها يرجّع "[object Object]" بلا فايدة.
// هذي الدالة تسحب رسالة مفيدة من أي شكل خطأ ممكن نواجهه.
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
