import { supabase } from "./supabaseClient";
import type { EntryPreset } from "./types";

export async function loadPresets(): Promise<EntryPreset[]> {
  const { data } = await supabase
    .from("entry_presets")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  return (data as EntryPreset[]) || [];
}

// اقتراحات السعر للنموذج اليدوي: كل الأسعار المسجّلة لهذي التركيبة
export function suggestionsFor(
  presets: EntryPreset[],
  carType: string,
  serviceType: string
): EntryPreset[] {
  if (!carType || !serviceType) return [];
  return presets.filter((p) => p.car_type === carType && p.service_type === serviceType);
}

export async function createPreset(preset: Omit<EntryPreset, "id">) {
  return supabase.from("entry_presets").insert(preset);
}

export async function updatePreset(id: string, patch: Partial<EntryPreset>) {
  return supabase.from("entry_presets").update(patch).eq("id", id);
}

export async function deletePreset(id: string) {
  return supabase.from("entry_presets").update({ active: false }).eq("id", id);
}
