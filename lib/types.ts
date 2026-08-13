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
};

export type Expense = {
  id: string;
  expense_type: string;
  amount: number;
  notes: string | null;
  occurred_at: string;
};

export type LookupItem = {
  id: string;
  name: string;
  color?: string;
};
