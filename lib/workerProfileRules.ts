export type EditableWorkerProfile = {
 name:string;
 worker_type:"worker"|"team";
 hourly_rate:number;
 notes:string|null;
 sort_order:number;
 active:boolean;
};

/** Validate before sending any profile update to RLS-guarded workers. */
export function validateWorkerProfile(p:EditableWorkerProfile):string|null {
 const name=p.name.trim();
 if(name.length<2||name.length>80)return "اسم العامل يجب أن يكون من حرفين إلى 80 حرفًا.";
 if(p.worker_type!=="worker"&&p.worker_type!=="team")return "اختر نوع العامل.";
 if(!Number.isFinite(p.hourly_rate)||p.hourly_rate<0||p.hourly_rate>100000||
  Math.abs(p.hourly_rate*100-Math.round(p.hourly_rate*100))>0.00001)
  return "الأجر يجب أن يكون مبلغًا صحيحًا بأقصى منزلتين عشريتين.";
 if(!Number.isInteger(p.sort_order)||p.sort_order<0||p.sort_order>10000)
  return "ترتيب العامل غير صحيح.";
 if(typeof p.active!=="boolean")return "حالة العامل غير صحيحة.";
 if((p.notes||"").trim().length>500)return "الملاحظات لا تتجاوز 500 حرف.";
 return null;
}
export function cleanWorkerProfile(p:EditableWorkerProfile):EditableWorkerProfile {
 return {...p,name:p.name.trim(),notes:p.notes?.trim()||null};
}
