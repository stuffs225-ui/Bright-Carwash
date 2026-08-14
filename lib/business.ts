export function getPaymentMethod(cash: number, card: number): string {
  if (cash > 0 && card > 0) return "مختلط";
  if (cash > 0) return "كاش";
  if (card > 0) return "بطاقة";
  return "غير محدد";
}

// اليوم الطبيعي: من منتصف الليل لمنتصف الليل.
// (استُبدل بها نظام الورديات 3ع–4ف السابق، لأنه كان يقسّم الليلة الواحدة
// على صفّين بجداول التقويم ويشوّه 38% من الأيام.)
export function getDayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function bonusPerWorker(shiftCarCount: number, threshold = 15, rate = 2): number {
  return shiftCarCount > threshold ? Number(((shiftCarCount - threshold) * rate).toFixed(2)) : 0;
}

// نستخدم en-US قصداً (مو ar-SA) عشان الأرقام تطلع بالأرقام الإنجليزية
// المعتادة (210.00) مو الأرقام الهندية العربية (٢١٠٫٠٠) يلي ar-SA يرجعها افتراضياً.
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

// لتنسيق أي تاريخ بأسماء أشهر/أيام عربية بس بأرقام إنجليزية وتقويم ميلادي
export const AR_GREGORIAN_LOCALE = "ar-SA-u-ca-gregory-nu-latn";

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type EntryDayChoice = "today" | "yesterday" | "custom";

// لإضافة سيارات لعملية غسيل صارت "أمس" أو أي يوم سابق (نسي العامل يسجّلها
// وقتها). نحتاج فقط تصحيح اليوم التقويمي، فنبقي وقت الساعة الحالي كما هو.
export function resolveOccurredAt(choice: EntryDayChoice, customDateKey: string): string {
  const now = new Date();
  if (choice === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  if (choice === "custom" && customDateKey) {
    const [y, m, d] = customDateKey.split("-").map(Number);
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
  }
  return now.toISOString();
}

// لتصحيح يوم عملية موجودة عند التعديل — يبدّل اليوم فقط، ويحافظ على وقت
// الساعة الأصلي بدل استبداله بالوقت الحالي.
export function withDateKey(dateKey: string, originalIso: string): string {
  const orig = new Date(originalIso);
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds()).toISOString();
}
