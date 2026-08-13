export type BreakEvenInput = {
  /** إجمالي المصروفات خلال نافذة التتبع */
  windowExpenses: number;
  /** إجمالي الإيراد خلال نافذة التتبع */
  windowRevenue: number;
  /** عدد العمليات خلال نافذة التتبع */
  windowEntries: number;
  /** طول النافذة بالأيام */
  windowDays: number;
  /** تجاوز يدوي للمصروف اليومي (0 = احسبه تلقائياً) */
  manualDailyTarget?: number;
};

export type BreakEven = {
  dailyExpense: number;
  avgTicket: number;
  carsNeeded: number;
};

export const BREAKEVEN_WINDOW_DAYS = 90;

export function computeBreakEven(input: BreakEvenInput): BreakEven {
  const { windowExpenses, windowRevenue, windowEntries, windowDays, manualDailyTarget = 0 } = input;

  const dailyExpense =
    manualDailyTarget > 0 ? manualDailyTarget : windowDays > 0 ? windowExpenses / windowDays : 0;

  const avgTicket = windowEntries > 0 ? windowRevenue / windowEntries : 0;

  // بدون متوسط فاتورة لا يمكن اشتقاق عدد سيارات ذي معنى
  const carsNeeded = avgTicket > 0 ? Math.ceil(dailyExpense / avgTicket) : 0;

  return {
    dailyExpense: Number(dailyExpense.toFixed(2)),
    avgTicket: Number(avgTicket.toFixed(2)),
    carsNeeded,
  };
}
