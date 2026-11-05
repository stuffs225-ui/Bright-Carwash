import {describe,it,expect} from "vitest";
import {evaluateShiftApproval,validateOwnerReopen,type ShiftReviewInput} from "./shiftReconciliation";
const base=():ShiftReviewInput=>({
  devices:[{deviceId:"A",registeredForShift:true,sealed:true,pendingCount:0,unreviewedCorrections:0}],
  recordedCash:110,recordedCard:210,actualCash:110,cardTerminalTotal:210,
  cardReportObjectId:"private/storage/card-report",managerApproved:true,
  differenceReason:null,ownerApprovedDifference:false,
});
describe("Carwash final shift approval",()=>{
  it("allows a fully synced and matched shift with manager approval",()=>{
    expect(evaluateShiftApproval(base()).canApprove).toBe(true);
  });
  it("blocks missing device seals, offline queues and corrections",()=>{
    const x=base(); x.devices[0].sealed=false;x.devices[0].pendingCount=1;
    expect(evaluateShiftApproval(x).canApprove).toBe(false);
  });
  it("requires card report image and physical counts",()=>{
    const x=base();x.cardReportObjectId=null;x.cardTerminalTotal=null;
    const r=evaluateShiftApproval(x);
    expect(r.canApprove).toBe(false);expect(r.blockers.length).toBeGreaterThanOrEqual(2);
  });
  it("requires reason and owner's approval on ANY imbalance",()=>{
    const x=base();x.actualCash=100;
    expect(evaluateShiftApproval(x).cashDifference).toBe(-10);
    expect(evaluateShiftApproval(x).canApprove).toBe(false);
    x.differenceReason="10 SAR shortage reviewed";x.ownerApprovedDifference=true;
    expect(evaluateShiftApproval(x).canApprove).toBe(true);
  });
  it("only allows owner reopening with documented reason",()=>{
    expect(validateOwnerReopen("owner","Wrong POS summary")).toBe(true);
    expect(validateOwnerReopen("manager","Wrong POS summary")).toBe(false);
    expect(validateOwnerReopen("owner","")).toBe(false);
  });
});
