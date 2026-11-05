/** Pure, carwash-only end-of-shift decision checks.
 * The server must re-evaluate this against authoritative database rows in a transaction.
 */
export type DeviceSeal = {
  deviceId: string;
  registeredForShift: boolean;
  sealed: boolean; // explicitly confirms the device finished uploading this shift
  pendingCount: number;
  unreviewedCorrections: number;
};
export type ShiftReviewInput = {
  devices: DeviceSeal[];
  recordedCash: number;
  recordedCard: number;
  actualCash: number | null;
  cardTerminalTotal: number | null;
  cardReportObjectId: string | null;
  managerApproved: boolean;
  differenceReason: string | null;
  ownerApprovedDifference: boolean;
};
export type ShiftReview = {
  cashDifference: number | null;
  cardDifference: number | null;
  hasDifference: boolean;
  blockers: string[];
  canApprove: boolean;
};

function toCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid financial value");
  return Math.round(value * 100);
}
export function evaluateShiftApproval(shift: ShiftReviewInput): ShiftReview {
  const blockers: string[] = [];
  const registered = shift.devices.filter(x=>x.registeredForShift);
  if (!registered.length) blockers.push("No registered devices for shift");
  if (registered.some(x=>!x.sealed || x.pendingCount!==0 || x.unreviewedCorrections!==0)) {
    blockers.push("Devices have not sealed and synced all reviewed entries");
  }
  if (shift.actualCash === null || shift.cardTerminalTotal === null) {
    blockers.push("Manager must count cash and enter card terminal total");
  }
  if (!shift.cardReportObjectId?.trim()) blockers.push("Card terminal statement photo required");
  const cashDifference = shift.actualCash===null ? null :
    (toCents(shift.actualCash)-toCents(shift.recordedCash))/100;
  const cardDifference = shift.cardTerminalTotal===null ? null :
    (toCents(shift.cardTerminalTotal)-toCents(shift.recordedCard))/100;
  const hasDifference = (cashDifference!==null && cashDifference!==0) ||
    (cardDifference!==null && cardDifference!==0);
  if (hasDifference) {
    if ((shift.differenceReason?.trim().length||0)<5) blockers.push("Difference needs written reason");
    if (!shift.ownerApprovedDifference) blockers.push("Owner approval required for balance difference");
  }
  if (!shift.managerApproved) blockers.push("Manager must approve generated settlement");
  return {cashDifference,cardDifference,hasDifference,blockers,canApprove:blockers.length===0};
}

export function validateOwnerReopen(role: "owner"|"manager"|"worker", reason: string): boolean {
  return role==="owner" && reason.trim().length>=5;
}
