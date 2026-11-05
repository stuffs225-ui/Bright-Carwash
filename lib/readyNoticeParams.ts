/** The outbox metadata client_mutation_id must NEVER be passed as an RPC argument.
 * PostgREST rejects unknown function arguments. Only the actual ready request IDs
 * should be forwarded. This is important for offline queue replay.
 */
export function readyNoticeRpcParams(payload: Record<string, unknown>): {
  p_entry_id?: string; p_client_mutation_id?: string;
} {
  const result: {p_entry_id?:string;p_client_mutation_id?:string} = {};
  if (typeof payload.p_entry_id === "string" && payload.p_entry_id.trim()) {
    result.p_entry_id = payload.p_entry_id;
  }
  if (typeof payload.p_client_mutation_id === "string" && payload.p_client_mutation_id.trim()) {
    result.p_client_mutation_id = payload.p_client_mutation_id;
  }
  if (!result.p_entry_id && !result.p_client_mutation_id) throw Error("No ready request reference");
  return result;
}
