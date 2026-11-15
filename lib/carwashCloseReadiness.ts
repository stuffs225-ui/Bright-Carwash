export type DayCloseCheck={
 id:"finished"|"delivered"|"devices"|"cash"|"network"|"reason";
 label:string;state:"passed"|"blocked"|"checking";
 message:string;
};
export type DayCloseInput={
 dayFinished:boolean;
 dataLoaded:boolean;
 undelivered:number|null;
 registeredDevices:number;
 unsealedDevices:number;
 actualCash:string;
 actualNetwork:string;
 cashMismatch:boolean;
 cardMismatch:boolean;
 differenceReason:string;
};
function moneyReady(input:string){
 if(!input.trim())return false;
 const value=Number(input);
 return Number.isFinite(value)&&value>=0&&
  Math.abs(value*100-Math.round(value*100))<0.000001;
}
export function dayCloseChecks(p:DayCloseInput):DayCloseCheck[]{
 const validCash=moneyReady(p.actualCash);
 const validNetwork=moneyReady(p.actualNetwork);
 const gapReasonNeeded=validCash&&validNetwork&&(p.cashMismatch||p.cardMismatch);
 return [
  {id:"finished",label:"انتهاء اليوم بتوقيت الرياض",
   state:p.dayFinished?"passed":"blocked",
   message:p.dayFinished?"انتهى اليوم":"لا يُقفل يوم الرياض قبل منتصف الليل"},
  {id:"delivered",label:"تسليم جميع السيارات",
   state:!p.dataLoaded||p.undelivered===null?"checking":
    p.undelivered===0?"passed":"blocked",
   message:!p.dataLoaded||p.undelivered===null?"جارٍ فحص التسليم":
    p.undelivered===0?"جميع السيارات مسلّمة":p.undelivered+" سيارة لم تُسلّم"},
  {id:"devices",label:"مزامنة وإغلاق جميع الأجهزة المسجلة",
   state:!p.dataLoaded?"checking":p.unsealedDevices===0?"passed":"blocked",
   message:!p.dataLoaded?"جارٍ فحص الأجهزة":
    p.unsealedDevices===0?
     p.registeredDevices===0?"لا توجد أجهزة مسجلة لهذا اليوم":"تم إغلاق الأجهزة المسجلة":
     p.unsealedDevices+" جهاز لم يؤكد الإغلاق"},
  {id:"cash",label:"تأكيد الكاش الفعلي",
   state:validCash?"passed":"blocked",
   message:validCash?"تم تسجيل قيمة الكاش":"أدخل قيمة الكاش الفعلي الصحيحة"},
  {id:"network",label:"تأكيد إجمالي الشبكة",
   state:validNetwork?"passed":"blocked",
   message:validNetwork?"تم تسجيل إجمالي الشبكة":"أدخل إجمالي جهاز الشبكة"},
  {id:"reason",label:"مراجعة سبب فروقات الموازنة",
   state:gapReasonNeeded&&p.differenceReason.trim().length<5?"blocked":"passed",
   message:gapReasonNeeded?
    p.differenceReason.trim().length<5?"اكتب سببًا واضحًا للفرق":"سُجّل سبب الفرق":
    "لا توجد فروقات مُدخلة تتطلب سببًا"}
 ];
}
export function canCloseDay(p:DayCloseInput):boolean{
 return dayCloseChecks(p).every(check=>check.state==="passed");
}
