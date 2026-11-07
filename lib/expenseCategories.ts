/** View-only normalization; imported source labels are never overwritten. */
export function canonicalExpenseType(source:string,notes?:string|null):string{
 const normalized=String(source||"").trim().replace(/أ|إ|آ/g,"ا").replace(/ة/g,"ه").replace(/\s+/g," ");
 const labels:Record<string,string>={
  "راتب":"رواتب",
  "مواد استهلاكيه":"مواد استهلاكية",
  "ايجار":"إيجار",
  "اصلاحات":"إصلاحات وصيانة",
  "كهرباء":"كهرباء",
  "اكل":"أكل وضيافة",
  "اخرى":"مصروفات أخرى"
 };
 if(labels[normalized])return labels[normalized];
 if(["حسين","محمد عمر"].includes(normalized))return "باسم شخص — يحتاج تصنيف";
 return source.trim()||"غير مصنف";
}
export const EXPENSE_QUICK_CHOICES=[
 {name:"وايت ماء",category:"مواد استهلاكية",note:"وايت ماء"},
 {name:"صابون",category:"مواد استهلاكية",note:"صابون"},
 {name:"واكس",category:"مواد استهلاكية",note:"واكس"},
 {name:"كهرباء",category:"كهرباء",note:""},
 {name:"صيانة وإصلاح",category:"اصلاحات",note:""},
 {name:"إيجار",category:"ايجار",note:""},
 {name:"مواد أخرى",category:"مواد استهلاكية",note:"مواد أخرى"},
 {name:"مصروف آخر",category:"اخرى",note:""}
] as const;
