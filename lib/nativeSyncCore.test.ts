import { describe, it, expect } from "vitest";
import { synchronizeNativeOutbox, type OutboxRecord, type DurableOutbox } from "./nativeSyncCore";

function setup() {
  const rows: OutboxRecord[] = ["a","b"].map(mutationId => ({
    mutationId, deviceId:"device-1", accountId:"worker-account", capturedAt:"2026-11-05T17:00:00Z",
    operation:"car-entry", payload:{}, status:"pending",
  }));
  const review: string[] = [];
  const store: DurableOutbox = {
    pending:async()=>rows.filter(x=>x.status==="pending"),
    markSynced:async id=>{const r=rows.find(x=>x.mutationId===id);if(r)r.status="synced";},
    markReview:async id=>{review.push(id);},
  };
  return {rows,store,review,ctx:{deviceId:"device-1",accountId:"worker-account",verifiedMembership:true,online:true}};
}
describe("Carwash native offline queue safeguards",()=>{
  it("preserves every row while offline",async()=>{
    const x=setup(),send=async()=>({status:"accepted" as const,mutationId:"a"});
    const report=await synchronizeNativeOutbox(x.store,send,{...x.ctx,online:false});
    expect(report.pending).toBe(2);
    expect(x.rows.every(v=>v.status==="pending")).toBe(true);
  });
  it("stores durable ACK for accepted or exact duplicate",async()=>{
    const x=setup();
    const report=await synchronizeNativeOutbox(x.store,async row=>({status:row.mutationId==="a"?"accepted":"duplicate",mutationId:row.mutationId}),x.ctx);
    expect(report.acknowledged).toBe(2);expect(report.pending).toBe(0);
    expect(x.rows.every(v=>v.status==="synced")).toBe(true);
  });
  it("never accepts acknowledgement of another financial mutation",async()=>{
    const x=setup();
    const report=await synchronizeNativeOutbox(x.store,async()=>({status:"duplicate",mutationId:"wrong"}),x.ctx);
    expect(report.acknowledged).toBe(0);expect(x.rows[0].status).toBe("pending");
  });
  it("blocks cross-account device upload and later rows",async()=>{
    const x=setup(),seen:string[]=[];
    const report=await synchronizeNativeOutbox(x.store,async r=>{seen.push(r.mutationId);return {status:"accepted",mutationId:r.mutationId};},{...x.ctx,accountId:"other"});
    expect(report.needsReview).toBe(true);expect(seen).toHaveLength(0);
  });
  it("stops after network failure without dropping the second event",async()=>{
    const x=setup();
    const report=await synchronizeNativeOutbox(x.store,async()=>{throw Error("lost response");},x.ctx);
    expect(report.pending).toBe(2);expect(x.rows.every(v=>v.status==="pending")).toBe(true);
  });
  it("requires an authorized session before uploading",async()=>{
    const x=setup();
    const report=await synchronizeNativeOutbox(x.store,async row=>({status:"accepted",mutationId:row.mutationId}),{...x.ctx,verifiedMembership:false});
    expect(report.acknowledged).toBe(0);expect(report.pending).toBe(2);
  });
});
