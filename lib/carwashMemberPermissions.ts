export type CarwashRole="owner"|"manager"|"worker";
export function canInviteCarwashAccount(actor:CarwashRole,requested:CarwashRole){
 return actor==="owner" || (actor==="manager"&&requested==="worker");
}
export function canModifyCarwashAccount(actor:CarwashRole,target:CarwashRole,requested:CarwashRole){
 return actor==="owner" || (actor==="manager"&&target==="worker"&&requested==="worker");
}
