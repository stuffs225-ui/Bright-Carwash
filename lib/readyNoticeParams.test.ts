import {describe,it,expect} from "vitest";
import {readyNoticeRpcParams} from "./readyNoticeParams";
describe("Carwash ready notification offline replay",()=>{
 it("omits unrelated outbox metadata that breaks PostgREST RPC",()=>{
  expect(readyNoticeRpcParams({
   p_entry_id:"entry-1",client_mutation_id:"outbox-mutation",
   created_at:"2026-11-05",unexpected:"secret",
  })).toEqual({p_entry_id:"entry-1"});
 });
 it("supports ready for a not-yet-synced car",()=>{
  expect(readyNoticeRpcParams({p_client_mutation_id:"car-mutation"}))
   .toEqual({p_client_mutation_id:"car-mutation"});
 });
 it("refuses an orphan ready request",()=>{
  expect(()=>readyNoticeRpcParams({client_mutation_id:"only-outbox-id"})).toThrow();
 });
});
