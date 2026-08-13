import { supabase } from "./supabaseClient";

export type AppSettings = {
  shift_car_threshold: number;
  worker_bonus_rate: number;
  shift_start_hour: number;
  shift_end_hour: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  shift_car_threshold: 15,
  worker_bonus_rate: 2,
  shift_start_hour: 15,
  shift_end_hour: 4,
};

export async function loadSettings(): Promise<AppSettings> {
  const { data } = await supabase.from("settings").select("key, value");
  const settings = { ...DEFAULT_SETTINGS };
  (data || []).forEach((row) => {
    if (row.key in settings) {
      (settings as Record<string, number>)[row.key] = Number(row.value);
    }
  });
  return settings;
}

export async function updateSetting(key: keyof AppSettings, value: number) {
  return supabase.from("settings").update({ value }).eq("key", key);
}
