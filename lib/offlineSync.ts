import { supabase } from "./supabaseClient";
import { getQueue, removeFromQueue } from "./offlineQueue";

// Network failures must never cause silent deletion of locally captured jobs.
export function isNetworkError(error: { code?: string } | null | undefined): boolean {
  return !!error && !error.code;
}

let flushing = false;
let latestError: string | null = null;
export function getOfflineSyncError(): string | null { return latestError; }

export async function flushOfflineQueue() {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return;
  flushing = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    latestError = null;
    for (const item of getQueue()) {
      const { error } = await supabase.from(item.table).insert(item.payload);
      if (!error) {
        removeFromQueue(item.id);
        continue;
      }
      // Retry after a success acknowledgement is lost: the same mutation id already exists.
      if (error.code === "23505" && error.message?.includes("client_mutation")) {
        removeFromQueue(item.id);
        continue;
      }
      latestError = error.message || "تعذرت مزامنة عملية محفوظة محلياً.";
      window.dispatchEvent(new Event("offline-sync-error"));
      break; // Keep failed item and remaining items; no silent data loss.
    }
  } finally {
    flushing = false;
  }
}
