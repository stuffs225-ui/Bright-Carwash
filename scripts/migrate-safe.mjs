// Safe source-preserving migration from the original carwash workbook.
// Usage: node scripts/migrate-safe.mjs <export.xlsx>
// Dry-run by default. To write: --confirm --approve-mismatches (if flagged).
// Environment: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server only, never commit).
import xlsx from "xlsx";

const file = process.argv.slice(2).find(s => !s.startsWith("--"));
if (!file) throw new Error("Supply the original Google Sheets XLSX export path");
const shouldWrite = process.argv.includes("--confirm");
const approveMismatches = process.argv.includes("--approve-mismatches");
const workbook = xlsx.readFile(file, { cellDates: true });

const data = (tab) => {
  const ws = workbook.Sheets[tab];
  if (!ws) throw new Error("Missing required sheet: " + tab);
  return xlsx.utils.sheet_to_json(ws, { header: 1, range: 1, defval: null });
};
const number = (n) => {
  const value = Number(n);
  return Number.isFinite(value) ? value : NaN;
};
const pad = n => String(n).padStart(2, "0");
const datePart = (dt) => {
  if (!(dt instanceof Date) || !Number.isFinite(dt.getTime())) return null;
  return [dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate()].map((n,i) => i ? pad(n) : String(n)).join("-");
};
const datetimePart = (date, time) => {
  const day = datePart(date);
  if (!day) return null;
  const hours = time instanceof Date ? time.getUTCHours() : 0;
  const minutes = time instanceof Date ? time.getUTCMinutes() : 0;
  const seconds = time instanceof Date ? time.getUTCSeconds() : 0;
  return `${day}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}+03:00`;
};
const onlyDatetime = (date) => {
  const day = datePart(date);
  if (!day) return null;
  return `${day}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+03:00`;
};

const entries = [], expenses = [], invalid = [], mismatches = [];
data("Main_Data").forEach((r, i) => {
  const sourceRow = i + 2;
  const cash = number(r[5]), card = number(r[6]), total = number(r[9]);
  const when = datetimePart(r[11], r[12]);
  if (!r[1] || !r[2] || !when || !Number.isFinite(cash) || !Number.isFinite(card)
      || cash < 0 || card < 0 || cash + card <= 0) {
    invalid.push({ table: "Main_Data", row: sourceRow, issue: "invalid date, category or split payment" });
    return;
  }
  const reportedTotal = Number.isFinite(total) ? total : null;
  const amountMismatch = reportedTotal !== null && Math.abs(reportedTotal - cash - card) > 0.011;
  if (amountMismatch) mismatches.push({row:sourceRow,cash,card,reportedTotal});
  entries.push({
    legacy_ref: `carwash:Main_Data:${sourceRow}`,
    car_type: String(r[1]).trim(),
    service_type: String(r[2]).trim(),
    cash_paid: cash,
    card_paid: card,
    occurred_at: when,
    notes: r[10] ? String(r[10]) : null,
    worker_name: r[14] ? String(r[14]).trim() : null,
    legacy_reported_total: reportedTotal,
    legacy_amount_mismatch: amountMismatch,
  });
});
data("Expenses").forEach((r, i) => {
  const sourceRow = i + 2;
  if (!r.some(x=>x !== null && x !== "")) return;
  const when = onlyDatetime(r[0]), amount = number(r[2]);
  if (!r[1] || !when || !Number.isFinite(amount) || amount <= 0) {
    invalid.push({table:"Expenses",row:sourceRow,issue:"invalid date/type/amount"});
    return;
  }
  expenses.push({
    legacy_ref: `carwash:Expenses:${sourceRow}`,
    expense_type: String(r[1]).trim(),
    amount,
    notes: r[3] ? String(r[3]) : null,
    occurred_at: when,
  });
});
const totals = {
  sourceCars: entries.length, sourceExpenses: expenses.length,
  cash: entries.reduce((s,r)=>s+r.cash_paid,0),
  card: entries.reduce((s,r)=>s+r.card_paid,0),
  reported: entries.reduce((s,r)=>s+(r.legacy_reported_total??r.cash_paid+r.card_paid),0),
  expenseTotal: expenses.reduce((s,r)=>s+r.amount,0),
};
const report = {
  mode: shouldWrite ? "write-requested" : "dry-run", totals,
  invalid: invalid.slice(0,100), invalidCount: invalid.length,
  mismatches: mismatches.slice(0,100), mismatchCount: mismatches.length,
};
console.log(JSON.stringify(report,null,2));
if (!shouldWrite) process.exit(0);
if (invalid.length) throw new Error("STOP: source has invalid rows. Resolve before cutover; no data written.");
if (mismatches.length && !approveMismatches) {
  throw new Error("STOP: mismatched historical totals require --approve-mismatches after review. No data written.");
}
const { createClient } = await import("@supabase/supabase-js");
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY via protected environment.");
const client = createClient(url, key, { auth: { persistSession: false } });
const batch = async (table, rows) => {
  let written = 0;
  for (let i=0;i<rows.length;i+=100) {
    const {error} = await client.from(table).upsert(rows.slice(i,i+100),
      {onConflict:"legacy_ref",ignoreDuplicates:true});
    if(error) throw new Error(`${table} batch at ${i}: ${error.message}`);
    written += Math.min(100, rows.length-i);
    console.log(`${table} processed: ${written}/${rows.length}`);
  }
};
await batch("entries",entries);
await batch("expenses",expenses);
console.log("Migration upload completed. Validate row counts and totals in Supabase before go-live.");
