import { createClient } from "@supabase/supabase-js";

// The preview must build safely before an isolated Supabase project exists.
// Unconfigured previews render a setup notice rather than connecting to
// Google Sheets, WorkshopOS, or any other user's database.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = !!(url && publishableKey);
export const supabase = createClient(
  url || "https://preview-unconfigured.supabase.co",
  publishableKey || "preview-placeholder-not-a-real-access-key"
);
