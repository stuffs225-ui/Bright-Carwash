import { toDateKey } from "./business";
import type { Entry, EntryPreset, Expense } from "./types";

export type DayRollup = {
  date: string;
  cars: number;
  revenue: number;
  expenses: number;
};

export type PriceOutlier = {
  date: string;
  carType: string;
  serviceType: string;
  amount: number;
  usual: number;
};

export type BatchDay = {
  minute: string;
  count: number;
};

export type Diagnostics = {
  expenseWithoutIncome: DayRollup[];
  incomeWithoutExpense: DayRollup[];
  silentDays: string[];
  priceOutliers: PriceOutlier[];
  batches: BatchDay[];
  totals: { days: number; cars: number; revenue: number; expenses: number };
};

/** كل التواريخ بين طرفين شاملةً — لكشف الأيام الغائبة تماماً */
function eachDate(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  while (cur <= end) {
    out.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function rollupByDay(entries: Entry[], expenses: Expense[]): Map<string, DayRollup> {
  const map = new Map<string, DayRollup>();
  const touch = (date: string) => {
    if (!map.has(date)) map.set(date, { date, cars: 0, revenue: 0, expenses: 0 });
    return map.get(date)!;
  };
  entries.forEach((e) => {
    const row = touch(toDateKey(new Date(e.occurred_at)));
    row.cars += 1;
    row.revenue += Number(e.gross);
  });
  expenses.forEach((x) => {
    touch(toDateKey(new Date(x.occurred_at))).expenses += Number(x.amount);
  });
  return map;
}

/** السعر المعتاد لكل تركيبة: من الأزرار الجاهزة إن وُجدت، وإلا منوال البيانات */
function usualPrices(entries: Entry[], presets: EntryPreset[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  presets.forEach((p) => {
    const key = `${p.car_type}|${p.service_type}`;
    map.set(key, [...(map.get(key) || []), Number(p.amount)]);
  });

  const counts = new Map<string, Map<number, number>>();
  entries.forEach((e) => {
    const key = `${e.car_type}|${e.service_type}`;
    if (map.has(key)) return; // الأزرار الجاهزة هي المرجع
    if (!counts.has(key)) counts.set(key, new Map());
    const inner = counts.get(key)!;
    const amt = Number(e.gross);
    inner.set(amt, (inner.get(amt) || 0) + 1);
  });
  counts.forEach((inner, key) => {
    const modal = [...inner.entries()].sort((a, b) => b[1] - a[1])[0];
    if (modal) map.set(key, [modal[0]]);
  });
  return map;
}

export function computeDiagnostics(
  entries: Entry[],
  expenses: Expense[],
  presets: EntryPreset[],
  startDate: string,
  endDate: string
): Diagnostics {
  const byDay = rollupByDay(entries, expenses);

  const expenseWithoutIncome = [...byDay.values()]
    .filter((d) => d.expenses > 0 && d.cars === 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const incomeWithoutExpense = [...byDay.values()]
    .filter((d) => d.cars > 0 && d.expenses === 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const silentDays = eachDate(startDate, endDate).filter((d) => !byDay.has(d));

  // أسعار شاذة: خارج نطاق ±40% من أقرب سعر معتاد لنفس التركيبة
  const usual = usualPrices(entries, presets);
  const priceOutliers: PriceOutlier[] = [];
  entries.forEach((e) => {
    const options = usual.get(`${e.car_type}|${e.service_type}`);
    if (!options || !options.length) return;
    const amount = Number(e.gross);
    const nearest = options.reduce((best, o) =>
      Math.abs(o - amount) < Math.abs(best - amount) ? o : best
    );
    if (nearest <= 0) return;
    const drift = Math.abs(amount - nearest) / nearest;
    if (drift > 0.4) {
      priceOutliers.push({
        date: toDateKey(new Date(e.occurred_at)),
        carType: e.car_type,
        serviceType: e.service_type,
        amount,
        usual: nearest,
      });
    }
  });
  priceOutliers.sort((a, b) => b.amount - a.amount);

  // عمليات متعددة بنفس الدقيقة = تسجيل مؤجّل بدل لحظي
  const perMinute = new Map<string, number>();
  entries.forEach((e) => {
    const key = new Date(e.occurred_at).toISOString().slice(0, 16);
    perMinute.set(key, (perMinute.get(key) || 0) + 1);
  });
  const batches = [...perMinute.entries()]
    .filter(([, count]) => count >= 3)
    .map(([minute, count]) => ({ minute: minute.replace("T", " "), count }))
    .sort((a, b) => b.count - a.count);

  return {
    expenseWithoutIncome,
    incomeWithoutExpense,
    silentDays,
    priceOutliers,
    batches,
    totals: {
      days: byDay.size,
      cars: entries.length,
      revenue: entries.reduce((s, e) => s + Number(e.gross), 0),
      expenses: expenses.reduce((s, x) => s + Number(x.amount), 0),
    },
  };
}
