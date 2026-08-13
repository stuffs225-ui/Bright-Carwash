import { supabase } from "./supabaseClient";

export type LookupTable = "car_types" | "service_types" | "expense_types";

export type LookupRow = {
  id: string;
  name: string;
  color?: string;
  active: boolean;
  sort_order: number;
};

export async function loadLookup(table: LookupTable): Promise<LookupRow[]> {
  const { data } = await supabase.from(table).select("*").order("sort_order");
  return (data as LookupRow[]) || [];
}

export async function addLookup(table: LookupTable, name: string, sortOrder: number) {
  return supabase.from(table).insert({ name: name.trim(), sort_order: sortOrder });
}

// التعطيل بدل الحذف: السجلات القديمة تخزّن الاسم نصاً، فحذف الصف
// يترك تلك السجلات بقيمة لم تعد بالقائمة.
export async function setLookupActive(table: LookupTable, id: string, active: boolean) {
  return supabase.from(table).update({ active }).eq("id", id);
}

export async function renameLookup(table: LookupTable, id: string, name: string) {
  return supabase.from(table).update({ name: name.trim() }).eq("id", id);
}
