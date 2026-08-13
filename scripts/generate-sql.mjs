// يولّد أوامر SQL (INSERT) جاهزة للصق المباشر في Supabase SQL Editor،
// كبديل لسكربت migrate.mjs لمن ما يقدر يشغّل Node.js من جهازه.
//
// الاستخدام: node scripts/generate-sql.mjs path/to/file.xlsx > out.sql

import xlsx from "xlsx";
import fs from "node:fs";

const TZ_OFFSET = "+03:00";
const filePath = process.argv[2];

if (!filePath) {
  console.error("الاستخدام: node scripts/generate-sql.mjs path/to/file.xlsx");
  process.exit(1);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

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

function sqlString(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlNumber(v) {
  return Number.isFinite(v) ? String(v) : "0";
}

const EXPENSE_TYPE_ALIASES = { "مواد استهلاكيه": "مواد استهلاكية" };

const workbook = xlsx.readFile(filePath, { cellDates: true });

// ---------------- Main_Data -> entries ----------------
const mainRows = xlsx.utils.sheet_to_json(workbook.Sheets["Main_Data"], { header: 1, defval: null, range: 1 });
const entryValues = [];

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

  if (!carType || !serviceType || cash + card <= 0) continue;
  const occurredAt = combineDateTime(dateCell, timeCell);
  if (!occurredAt) continue;

  entryValues.push(
    `(${sqlString(String(carType).trim())}, ${sqlString(String(serviceType).trim())}, ${sqlNumber(cash)}, ${sqlNumber(card)}, ${sqlString(notes ? String(notes).trim() : null)}, ${sqlString(occurredAt)}, ${sqlString(workerName ? String(workerName).trim() : null)})`
  );
}

// ---------------- Expenses -> expenses ----------------
const expenseRows = xlsx.utils.sheet_to_json(workbook.Sheets["Expenses"], { header: 1, defval: null, range: 1 });
const expenseValues = [];

for (const row of expenseRows) {
  const dateCell = row[0];
  const rawType = row[1];
  const amount = toNumber(row[2]);
  const notes = row[3];

  if (!rawType || amount <= 0) continue;
  const occurredAt = singleDateTime(dateCell);
  if (!occurredAt) continue;

  const type = String(rawType).trim();
  expenseValues.push(
    `(${sqlString(EXPENSE_TYPE_ALIASES[type] || type)}, ${sqlNumber(amount)}, ${sqlString(notes ? String(notes).trim() : null)}, ${sqlString(occurredAt)})`
  );
}

const BATCH = 500;
let out = "";
out += `-- نقل ${entryValues.length} عملية غسيل\n`;
for (let i = 0; i < entryValues.length; i += BATCH) {
  out += `insert into entries (car_type, service_type, cash_paid, card_paid, notes, occurred_at, worker_name) values\n`;
  out += entryValues.slice(i, i + BATCH).join(",\n");
  out += ";\n\n";
}

out += `-- نقل ${expenseValues.length} مصروف\n`;
for (let i = 0; i < expenseValues.length; i += BATCH) {
  out += `insert into expenses (expense_type, amount, notes, occurred_at) values\n`;
  out += expenseValues.slice(i, i + BATCH).join(",\n");
  out += ";\n\n";
}

fs.writeFileSync("/dev/stdout", out);
console.error(`تم توليد ${entryValues.length} سيارة و ${expenseValues.length} مصروف.`);
