export function getPaymentMethod(cash: number, card: number): string {
  if (cash > 0 && card > 0) return "مختلط";
  if (cash > 0) return "كاش";
  if (card > 0) return "بطاقة";
  return "غير محدد";
}

// الوردية تمتد من ساعة البداية لين ساعة النهاية اليوم التالي، فتعبر منتصف الليل
export function getCurrentShiftWindow(now: Date, startHour = 15, endHour = 4): { start: Date; end: Date } {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, 0, 0, 0);

  if (now < todayStart) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      start: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), startHour, 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, 0, 0, 0),
    };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    start: todayStart,
    end: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), endHour, 0, 0, 0),
  };
}

export function bonusPerWorker(shiftCarCount: number, threshold = 15, rate = 2): number {
  return shiftCarCount > threshold ? Number(((shiftCarCount - threshold) * rate).toFixed(2)) : 0;
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
