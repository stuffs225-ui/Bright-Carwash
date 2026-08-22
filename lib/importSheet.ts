import type { Entry, Expense } from "./types";

// نفس منطق التحليل بالضبط اللي استُخدم بالترحيل الأول (scripts/migrate.mjs)
// عشان أي شيت بنفس تنسيق Google Sheets الأصلي (Main_Data + Expenses) يُقرأ
// بنفس الطريقة، بغض النظر متى استُخدم — استيراد أول مرة أو رفع لاحق لإضافة
// سجلات ناقصة فقط.

const TZ_OFFSET = "+03:00";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateParts(date: Date) {
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    h: date.getUTCHours(),
    mi: date.getUTCMinutes(),
    s: date.getUTCSeconds(),
  };
}

function combineDateTime(dateCell: unknown, timeCell: unknown): string | null {
  if (!(dateCell instanceof Date)) return null;
  const dp = dateParts(dateCell);
  let h = 0, mi = 0, s = 0;
  if (timeCell instanceof Date) {
    const tp = dateParts(timeCell);
    h = tp.h; mi = tp.mi; s = tp.s;
  }
  return `${dp.y}-${pad(dp.m)}-${pad(dp.d)}T${pad(h)}:${pad(mi)}:${pad(s)}${TZ_OFFSET}`;
}

function singleDateTime(dateCell: unknown): string | null {
  if (!(dateCell instanceof Date)) return null;
  const dp = dateParts(dateCell);
  return `${dp.y}-${pad(dp.m)}-${pad(dp.d)}T${pad(dp.h)}:${pad(dp.mi)}:${pad(dp.s)}${TZ_OFFSET}`;
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const EXPENSE_TYPE_ALIASES: Record<string, string> = {
  "مواد استهلاكيه": "مواد استهلاكية",
};

export type ParsedImport = {
  entries: Omit<Entry, "id" | "gross" | "payment_method" | "pending">[];
  expenses: Omit<Expense, "id">[];
  skippedEntries: number;
  skippedExpenses: number;
};

export async function parseSheet(buffer: ArrayBuffer): Promise<ParsedImport> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const entries: ParsedImport["entries"] = [];
  let skippedEntries = 0;
  const mainSheet = workbook.Sheets["Main_Data"];
  if (mainSheet) {
    const mainRows = XLSX.utils.sheet_to_json(mainSheet, { header: 1, defval: null, range: 1 }) as unknown[][];
    for (const row of mainRows) {
      const carType = row[1];
      const serviceType = row[2];
      const paymentMethodText = row[4];
      const notes = row[10];
      const dateCell = row[11];
      const timeCell = row[12];
      const workerName = row[14];

      let cash = toNumber(row[5]);
      let card = toNumber(row[6]);
      if (cash + card <= 0) {
        const legacyTotal = toNumber(row[9]);
        if (legacyTotal > 0) {
          if (paymentMethodText === "بطاقة") card = legacyTotal;
          else cash = legacyTotal;
        }
      }

      if (!carType || !serviceType || cash + card <= 0) {
        skippedEntries++;
        continue;
      }
      const occurredAt = combineDateTime(dateCell, timeCell);
      if (!occurredAt) {
        skippedEntries++;
        continue;
      }

      entries.push({
        car_type: String(carType).trim(),
        service_type: String(serviceType).trim(),
        cash_paid: cash,
        card_paid: card,
        notes: notes ? String(notes).trim() : null,
        occurred_at: occurredAt,
        worker_name: workerName ? String(workerName).trim() : null,
      });
    }
  }

  const expenses: ParsedImport["expenses"] = [];
  let skippedExpenses = 0;
  const expenseSheet = workbook.Sheets["Expenses"];
  if (expenseSheet) {
    const expenseRows = XLSX.utils.sheet_to_json(expenseSheet, { header: 1, defval: null, range: 1 }) as unknown[][];
    for (const row of expenseRows) {
      const dateCell = row[0];
      const rawType = row[1];
      const amount = toNumber(row[2]);
      const notes = row[3];

      if (!rawType || amount <= 0) {
        skippedExpenses++;
        continue;
      }
      const occurredAt = singleDateTime(dateCell);
      if (!occurredAt) {
        skippedExpenses++;
        continue;
      }

      const type = String(rawType).trim();
      expenses.push({
        expense_type: EXPENSE_TYPE_ALIASES[type] || type,
        amount,
        notes: notes ? String(notes).trim() : null,
        occurred_at: occurredAt,
      });
    }
  }

  return { entries, expenses, skippedEntries, skippedExpenses };
}

// مفتاح مطابقة لتجنّب التكرار عند إعادة رفع نفس الشيت: التاريخ + الوقت
// (للدقيقة، بدون ثواني) + النوع + المبلغ الإجمالي — بدون رقم مميز بالشيت
// هذا أدق ما يُميّز نفس العملية دون تحسّس زائد لثواني غير موثوقة بالإكسل.
function minuteKey(occurredAt: string): string {
  return occurredAt.slice(0, 16); // YYYY-MM-DDTHH:MM
}

export function entryKey(e: { occurred_at: string; car_type: string; service_type: string; cash_paid: number; card_paid: number }): string {
  const gross = (Number(e.cash_paid) || 0) + (Number(e.card_paid) || 0);
  return `${minuteKey(e.occurred_at)}|${e.car_type}|${e.service_type}|${gross.toFixed(2)}`;
}

export function expenseKey(x: { occurred_at: string; expense_type: string; amount: number }): string {
  return `${minuteKey(x.occurred_at)}|${x.expense_type}|${Number(x.amount).toFixed(2)}`;
}
