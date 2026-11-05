// طابور محلي (localStorage) للعمليات يلي تنسجل والنت مقطوع، لين ما يرجع الاتصال

export type QueuedMutation = {
  id: string;
  table: "entries" | "expenses" | "ready_notice";
  payload: Record<string, unknown>;
  createdAt: string;
  actorId?: string | null;
};

const STORAGE_KEY = "carwash_offline_queue_v1";
let activeUserId: string | null = null;
export function setOfflineActor(id: string | null) { activeUserId = id; }

function readQueue(): QueuedMutation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedMutation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event("offline-queue-changed"));
}

export function getQueue(): QueuedMutation[] {
  return readQueue();
}

export function getQueueByTable(table: QueuedMutation["table"]): QueuedMutation[] {
  return readQueue().filter((item) => item.table === table);
}

export function enqueue(table: QueuedMutation["table"], payload: Record<string, unknown>): QueuedMutation {
  const queue = readQueue();
  const id = typeof payload.client_mutation_id === "string" && payload.client_mutation_id
    ? payload.client_mutation_id
    : ((crypto as { randomUUID?: () => string }).randomUUID?.() || String(Date.now() + Math.random()));
  const item: QueuedMutation = {
    id,
    table,
    payload: { ...payload, client_mutation_id: id },
    createdAt: new Date().toISOString(),
    actorId: activeUserId,
  };
  queue.push(item);
  writeQueue(queue);
  return item;
}

export function removeFromQueue(id: string) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export function queueLength(): number {
  return readQueue().length;
}
