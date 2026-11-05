/** Carwash-only native outbox protocol. SQLite adapter and actual RPC transport are separate.
 * The server is the financial source of truth; never delete a record before durable ACK.
 */
export type OutboxRecord = {
  mutationId: string;
  deviceId: string;
  accountId: string;
  capturedAt: string;
  operation: "car-entry" | "local-entry-revision" | "expense" | "ready-message";
  payload: Record<string, unknown>;
  status: "pending" | "synced" | "review";
};

export type ServerSyncResult =
  | { status: "accepted"; mutationId: string }
  | { status: "duplicate"; mutationId: string }
  | { status: "retryable"; message: string }
  | { status: "review"; message: string };

export interface DurableOutbox {
  pending(): Promise<OutboxRecord[]>; // ordered by durable insertion timestamp
  markSynced(mutationId: string): Promise<void>; // within SQLite transaction
  markReview(mutationId: string, reason: string): Promise<void>;
}

export type SyncReport = {
  acknowledged: number;
  pending: number;
  needsReview: boolean;
  error: string | null;
};

export async function synchronizeNativeOutbox(
  store: DurableOutbox,
  send: (record: OutboxRecord) => Promise<ServerSyncResult>,
  context: { deviceId: string; accountId: string; verifiedMembership: boolean; online: boolean },
): Promise<SyncReport> {
  const rows = await store.pending();
  const state: SyncReport = { acknowledged: 0, pending: rows.length, needsReview: false, error: null };
  if (!context.online) { state.error = "offline"; return state; }
  if (!context.verifiedMembership) { state.error = "verified login and role required"; return state; }
  for (const row of rows) {
    if (row.status !== "pending") continue;
    if (!row.mutationId || row.accountId !== context.accountId || row.deviceId !== context.deviceId) {
      state.needsReview = true;
      state.error = "outbox owner/device mismatch; do not switch or sign out without review";
      break;
    }
    let result: ServerSyncResult;
    try {
      result = await send(row);
    } catch {
      state.error = "network or server unavailable; operation preserved";
      break;
    }
    // ACK is accepted only for the SAME submitted UUID.
    if ((result.status === "accepted" || result.status === "duplicate") && result.mutationId === row.mutationId) {
      await store.markSynced(row.mutationId);
      state.acknowledged++;
      state.pending--;
      continue;
    }
    if (result.status === "review") {
      await store.markReview(row.mutationId, result.message);
      state.needsReview = true;
      state.error = result.message;
    } else {
      state.error = result.status === "retryable" ? result.message : "server acknowledgement mismatch";
    }
    break; // FIFO preserves financial order
  }
  return state;
}
