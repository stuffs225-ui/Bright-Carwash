import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

const TABLES = ["entries", "expenses", "car_types", "service_types", "expense_types", "settings"] as const;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const dump: Record<string, unknown> = {};

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      return NextResponse.json({ ok: false, error: `${table}: ${error.message}` }, { status: 500 });
    }
    dump[table] = data;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.json`;
  const { error: uploadError } = await supabase.storage
    .from("backups")
    .upload(filename, JSON.stringify(dump, null, 2), { contentType: "application/json" });

  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, filename, tables: Object.keys(dump).map((t) => ({ table: t, rows: (dump[t] as unknown[]).length })) });
}
