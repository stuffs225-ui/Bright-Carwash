export const SHIFT_CAR_THRESHOLD = 15;
export const WORKER_BONUS_RATE = 2;
export const SHIFT_START_HOUR = 15;
export const SHIFT_END_HOUR = 4;

export function getPaymentMethod(cash: number, card: number): string {
  if (cash > 0 && card > 0) return "مختلط";
  if (cash > 0) return "كاش";
  if (card > 0) return "بطاقة";
  return "غير محدد";
}

// الوردية تمتد من 3 عصراً لين 4 فجراً اليوم التالي، فتعبر منتصف الليل
export function getCurrentShiftWindow(now: Date): { start: Date; end: Date } {
  const today15 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), SHIFT_START_HOUR, 0, 0, 0);

  if (now < today15) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      start: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), SHIFT_START_HOUR, 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), SHIFT_END_HOUR, 0, 0, 0),
    };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    start: today15,
    end: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), SHIFT_END_HOUR, 0, 0, 0),
  };
}

export function bonusPerWorker(shiftCarCount: number): number {
  return shiftCarCount > SHIFT_CAR_THRESHOLD
    ? Number(((shiftCarCount - SHIFT_CAR_THRESHOLD) * WORKER_BONUS_RATE).toFixed(2))
    : 0;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
