// نقل البيانات من ملف إكسل Google Sheets (Main_Data + Expenses) إلى Supabase
//
// الاستخدام:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate.mjs path/to/file.xlsx
//   بدون --confirm الأمر يسوي "تجربة جافة" (dry run) فقط ويطبع ملخص العدد بدون كتابة شي.
//   أضف --confirm لتنفيذ الإدخال الفعلي.
//   أضف --truncate لحذف كل البيانات الحالية بجدولي entries/expenses قبل الاستيراد (لتجنب التكرار عند إعادة التشغيل).
//
// تنبيه: يفترض السكربت إن كل الأوقات المسجلة بالإكسل هي بتوقيت السعودية
// (Asia/Riyadh, +03:00 بدون توقيت صيفي). لو المغسلة بمنطقة زمنية مختلفة، عدّل TZ_OFFSET.

import { createClient } from "@supabase/supabase-js";
import xlsx from "xlsx";

const TZ_OFFSET = "+03:00";

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
const shouldConfirm = args.includes("--confirm");
const shouldTruncate = args.includes("--truncate");

if (!filePath) {
  console.error("الاستخدام: node scripts/migrate.mjs path/to/file.xlsx [--confirm] [--truncate]");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("لازم تحدد SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY كمتغيرات بيئة.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function pad(n) {
  return String(n).padStart(2, "0");
}

// SheetJS بيرجع خلايا التاريخ كـ Date مبني من مكونات UTC، فنقرأ المكونات
// بـ getUTC* عشان نحصل على القيمة "كما هي مكتوبة" بالخلية بدون تحويل منطقة زمنية.
function dateParts(date) {
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    h: date.getUTCHours(),
    mi: date.getUTCMinutes(),
    s: date.getUTCSeconds(),
  };
}

function combineDateTime(dateCell, timeCell) {
  if (!(dateCell instanceof Date)) return null;
  const dp = dateParts(dateCell);
  let h = 0, mi = 0, s = 0;
  if (timeCell instanceof Date) {
    const tp = dateParts(timeCell);
    h = tp.h; mi = tp.mi; s = tp.s;
  }
  return `${dp.y}-${pad(dp.m)}-${pad(dp.d)}T${pad(h)}:${pad(mi)}:${pad(s)}${TZ_OFFSET}`;
}

function singleDateTime(dateCell) {
  if (!(dateCell instanceof Date)) return null;
  const dp = dateParts(dateCell);
  return `${dp.y}-${pad(dp.m)}-${pad(dp.d)}T${pad(dp.h)}:${pad(dp.mi)}:${pad(dp.s)}${TZ_OFFSET}`;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const EXPENSE_TYPE_ALIASES = {
  "مواد استهلاكيه": "مواد استهلاكية",
};

async function main() {
  const workbook = xlsx.readFile(filePath, { cellDates: true });

  // ---------------- Main_Data -> entries ----------------
  const mainSheet = workbook.Sheets["Main_Data"];
  const mainRows = xlsx.utils.sheet_to_json(mainSheet, { header: 1, defval: null, range: 1 });

  const entries = [];
  let skippedEntries = 0;
  let recoveredLegacyRows = 0;
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

    // بعض السجلات القديمة جداً (قبل فصل كاش/بطاقة) تسجل المبلغ بعمود
    // "اجمالي" (J) فقط بدون Cash Paid/Card Paid. نسترجعها من هناك.
    if (cash + card <= 0) {
      const legacyTotal = toNumber(row[9]);
      if (legacyTotal > 0) {
        if (paymentMethodText === "بطاقة") card = legacyTotal;
        else cash = legacyTotal;
        recoveredLegacyRows++;
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

  // ---------------- Expenses -> expenses ----------------
  const expenseSheet = workbook.Sheets["Expenses"];
  const expenseRows = xlsx.utils.sheet_to_json(expenseSheet, { header: 1, defval: null, range: 1 });

  const expenses = [];
  let skippedExpenses = 0;
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

  console.log(`Main_Data: ${entries.length} سجل صالح للاستيراد، ${skippedEntries} تم تجاهله (بيانات ناقصة/مبلغ صفري).`);
  if (recoveredLegacyRows) console.log(`  (منها ${recoveredLegacyRows} سجل قديم تم استرجاع مبلغه من عمود "اجمالي" بدل كاش/بطاقة)`);
  console.log(`Expenses: ${expenses.length} سجل صالح للاستيراد، ${skippedExpenses} تم تجاهله.`);

  if (!shouldConfirm) {
    console.log("\n(تجربة جافة فقط — ما تم كتابة أي شي. أضف --confirm للتنفيذ الفعلي.)");
    console.log("عينة أول 3 سجلات سيارات:", entries.slice(0, 3));
    console.log("عينة أول 3 مصروفات:", expenses.slice(0, 3));
    return;
  }

  if (shouldTruncate) {
    console.log("حذف البيانات الحالية من entries و expenses...");
    await supabase.from("entries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("expenses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  const BATCH_SIZE = 500;

  console.log("جاري استيراد السيارات...");
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("entries").insert(batch);
    if (error) {
      console.error(`خطأ بالدفعة ${i}-${i + batch.length}:`, error.message);
      process.exit(1);
    }
    console.log(`  تم استيراد ${Math.min(i + BATCH_SIZE, entries.length)} / ${entries.length}`);
  }

  console.log("جاري استيراد المصروفات...");
  for (let i = 0; i < expenses.length; i += BATCH_SIZE) {
    const batch = expenses.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("expenses").insert(batch);
    if (error) {
      console.error(`خطأ بالدفعة ${i}-${i + batch.length}:`, error.message);
      process.exit(1);
    }
    console.log(`  تم استيراد ${Math.min(i + BATCH_SIZE, expenses.length)} / ${expenses.length}`);
  }

  console.log("\nتم النقل بنجاح!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
