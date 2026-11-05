/** Worker dashboard is always scoped to the active approved-by-manager settlement cycle.
 * A new open cycle means a fresh screen, without deleting archived financial records.
 */
export type WorkerCar = {
  id: string;
  shift_id?: string | null;
  cash_paid: number;
  card_paid: number;
  discount_amount?: number | null;
  pending?: boolean;
};
export type WorkerShiftSummary = {
  cars: number;
  collectiveTens: number;
  cashCollected: number;
  cardCollected: number;
  discounts: number;
  pending: number;
  entries: WorkerCar[];
};
/** Deliberately does NOT try to identify individual employees: the worker login is shared. */
export function workerShiftSummary(
  all: WorkerCar[], openShiftId: string | null,
  baseCrewRate = 10
): WorkerShiftSummary {
  const entries = openShiftId ? all.filter(x => x.shift_id === openShiftId) : [];
  if (!Number.isFinite(baseCrewRate) || baseCrewRate < 0) throw Error("Invalid collective rate");
  const sum = (field: "cash_paid"|"card_paid"|"discount_amount") =>
    entries.reduce((n,x) => n + Math.round(Number(x[field]||0)*100),0)/100;
  return {
    cars: entries.length,
    collectiveTens: Math.round(entries.length * baseCrewRate * 100)/100,
    cashCollected: sum("cash_paid"),
    cardCollected: sum("card_paid"),
    discounts: sum("discount_amount"),
    pending: entries.filter(x=>x.pending).length,
    entries,
  };
}
