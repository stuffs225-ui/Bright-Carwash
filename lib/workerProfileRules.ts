export type EditableWorkerProfile = {
 name:string;
 worker_type:"worker"|"team";
 hourly_rate:number;
 notes:string|null;
 phone?:string|null;
 job_title?:string|null;
 joined_on?:string|null;
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
 const phone=(p.phone||"").trim();
 if(phone&&(!/^[+0-9 ()-]{7,25}$/.test(phone)||(phone.match(/\d/g)||[]).length<7))
  return "رقم التواصل غير صحيح.";
 if((p.job_title||"").trim().length>80)return "المسمى الوظيفي لا يتجاوز 80 حرفًا.";
 if(p.joined_on&&!/^\d{4}-\d{2}-\d{2}$/.test(p.joined_on))
  return "تاريخ مباشرة العمل غير صحيح.";
 return null;
}
export function cleanWorkerProfile(p:EditableWorkerProfile):EditableWorkerProfile {
 return {...p,name:p.name.trim(),notes:p.notes?.trim()||null,
  phone:p.phone?.trim()||null,job_title:p.job_title?.trim()||null,joined_on:p.joined_on||null};
}
