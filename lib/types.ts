export type Entry = {
  id: string;
  car_type: string;
  service_type: string;
  cash_paid: number;
  card_paid: number;
  gross: number;
  payment_method: string;
  notes: string | null;
  occurred_at: string;
  worker_name: string | null;
  pending?: boolean;
};

export type Expense = {
  id: string;
  expense_type: string;
  amount: number;
  notes: string | null;
  occurred_at: string;
};

export type EntryPreset = {
  id: string;
  car_type: string;
  service_type: string;
  amount: number;
  sort_order: number;
  active?: boolean;
};

export type Worker = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  notes: string | null;
};

export type LedgerEntry = {
  id: string;
  worker_id: string;
  kind: "earning" | "payment";
  amount: number;
  occurred_at: string;
  payment_source: string | null;
  expense_id: string | null;
  notes: string | null;
};

export type WorkerBalance = {
  worker: Worker;
  earned: number;
  paid: number;
  balance: number;
  entries: number;
};

export type LookupItem = {
  id: string;
  name: string;
  color?: string;
};
