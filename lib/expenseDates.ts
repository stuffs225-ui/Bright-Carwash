/** Riyadh operational dates stay independent of the device time zone. */
export function riyadhDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const data = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return data.year + "-" + data.month + "-" + data.day;
}

/** The service date of an expense; created_at separately records actual posting time. */
export function expenseEffectiveTimestamp(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid expense date");
  const timestamp = new Date(date + "T12:00:00+03:00");
  if (!Number.isFinite(timestamp.getTime()) || riyadhDate(timestamp) !== date) {
    throw new Error("Invalid calendar date");
  }
  return timestamp.toISOString();
}

export function lateExpenseMonth(date: string, now = new Date()): boolean {
  const current = riyadhDate(now);
  return date.slice(0,7) < current.slice(0,7);
}
