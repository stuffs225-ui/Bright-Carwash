import { supabase } from "./supabaseClient";

export type AppSettings = {
  shift_car_threshold: number;
  worker_bonus_rate: number;
  shift_start_hour: number;
  shift_end_hour: number;
  backup_email: string;
  backup_interval_days: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  shift_car_threshold: 15,
  worker_bonus_rate: 2,
  shift_start_hour: 15,
  shift_end_hour: 4,
  backup_email: "Aburaykah@gmail.com",
  backup_interval_days: 10,
};

const STRING_KEYS = new Set<keyof AppSettings>(["backup_email"]);

export async function loadSettings(): Promise<AppSettings> {
  const { data } = await supabase.from("settings").select("key, value");
  const settings = { ...DEFAULT_SETTINGS };
  const mutable: Record<string, string | number> = settings;
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
