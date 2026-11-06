export type CarwashRole="manager"|"worker";
export function canInviteCarwashAccount(actor:CarwashRole,requested:CarwashRole){
 return actor==="manager"&&requested==="worker";
}
export function canModifyCarwashAccount(actor:CarwashRole,target:CarwashRole,requested:CarwashRole){
 return actor==="manager"&&target==="worker"&&requested==="worker";
}
