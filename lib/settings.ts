import { supabase } from "./supabaseClient";

export type AppSettings = {
  shift_car_threshold: number;
  worker_bonus_rate: number;
  backup_email: string;
  backup_interval_days: number;
  daily_expense_target: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  shift_car_threshold: 15,
  worker_bonus_rate: 2,
  backup_email: "",
  backup_interval_days: 10,
  daily_expense_target: 0,
};

const STRING_KEYS = new Set<keyof AppSettings>(["backup_email"]);

export async function loadSettings(): Promise<AppSettings> {
  const { data } = await supabase.from("settings").select("key, value");
  const settings = { ...DEFAULT_SETTINGS };
  const mutable = settings as unknown as Record<string, string | number>;
  (data || []).forEach((row) => {
    const key = row.key as keyof AppSettings;
    if (key in settings) {
      mutable[key] = STRING_KEYS.has(key) ? String(row.value) : Number(row.value);
    }
  });
  return settings;
}

export async function updateSetting(key: keyof AppSettings, value: number | string) {
  return supabase.from("settings").update({ value }).eq("key", key);
}
