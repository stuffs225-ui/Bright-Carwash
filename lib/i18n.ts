// ترجمة مخصّصة لصفحة تسجيل السيارات فقط (تسجيل سريع/فردي/جماعي + جداولها)
// عشان يقدر عامل يفضّل الإنجليزي يستخدم الصفحة بلغته. باقي النظام
// (التحليل، التقارير، الإعدادات) يبقى عربي فقط — خارج نطاق هذي الميزة.
//
// النمط: النص العربي نفسه هو مفتاح القاموس، فلا حاجة لأسماء مفاتيح مجردة —
// t(lang, "نص عربي", vars?) يرجّع نفس النص بالعربي، أو مقابله الإنجليزي.

export type Lang = "ar" | "en";

const LANG_KEY = "carwash_lang_v1";

export function getLang(): Lang {
  if (typeof window === "undefined") return "ar";
  return localStorage.getItem(LANG_KEY) === "en" ? "en" : "ar";
}

export function setLang(lang: Lang) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LANG_KEY, lang);
  window.dispatchEvent(new CustomEvent("carwash-lang-changed", { detail: lang }));
}

const EN: Record<string, string> = {
  "تاريخ التسجيل": "Entry date",
  "اليوم": "Today",
  "اليوم - ": "Today - ",
  "أمس": "Yesterday",
  "تاريخ آخر": "Other date",
  "⚠️ السيارات المُضافة الآن ستُسجَّل ليوم {date}": "⚠️ Cars added now will be logged for {date}",
  "تسجيل سريع": "Quick add",
  "إضافة عدة سيارات دفعة وحدة": "Add multiple cars at once",
  "إدخال سيارة جديدة": "Add a new car",
  "رجوع لإدخال سيارة واحدة": "Back to single entry",
  "➕ إضافة عدة سيارات": "➕ Add multiple cars",
  "نوع السيارة": "Car type",
  "اختر...": "Select...",
  "نوع الخدمة": "Service type",
  "الأسعار المعتادة لهذي التركيبة": "Usual prices for this combo",
  "كاش": "Cash",
  "بطاقة": "Card",
  "ملاحظات": "Notes",
  "أي تفاصيل إضافية...": "Any extra details...",
  "إضافة السيارة": "Add car",
  "حفظ الكل ({n})": "Save all ({n})",
  "+ إضافة سطر": "+ Add row",
  "حذف السطر": "Delete row",
  "السيارات": "Cars",
  "الإجمالي": "Total",
  "مكافأة اليوم": "Today's bonus",
  "مكافأة كل عامل": "Bonus per worker",
  "سيارات اليوم": "Today's cars",
  "الدخل الشهري": "Monthly income",
  "عدد السيارات": "Car count",
  "لا توجد بيانات دخل لهذا الشهر.": "No income data for this month.",
  "الوقت": "Time",
  "السيارة": "Car",
  "الخدمة": "Service",
  "الدفع": "Payment",
  "إجراءات": "Actions",
  "لا توجد إدخالات بهذا اليوم.": "No entries for this day.",
  "لا توجد إدخالات لليوم.": "No entries for today.",
  "تعديل": "Edit",
  "حذف": "Delete",
  "⏳ بانتظار الرفع": "⏳ Waiting to sync",
  "التاريخ": "Date",
  "حفظ": "Save",
  "إلغاء": "Cancel",
  "هدف اليوم": "Today's goal",
  "{a} / {b} سيارة": "{a} / {b} cars",
  "تجاوزت التعادل — الفائض {amt}": "Break-even exceeded — surplus {amt}",
  "باقي {n} سيارة لتغطية مصروف اليوم ({amt}).": "{n} more car(s) needed to cover today's expense ({amt}).",
  " متوسط الفاتورة {amt}.": " Average ticket {amt}.",
  "أنجزتوا هدف اليوم 👏": "Today's goal reached 👏",
  "باقي {n} سيارة على هدف اليوم.": "{n} more car(s) to reach today's goal.",
  "يرجى اختيار نوع السيارة ونوع الخدمة.": "Please choose a car type and service type.",
  "الرجاء إدخال مبلغ صحيح.": "Please enter a valid amount.",
  "اختر التاريخ أولاً.": "Choose the date first.",
  "تمت إضافة السيارة بنجاح!": "Car added successfully!",
  "تم تسجيل": "Registered",
  "تأكد إن كل سطر فيه نوع سيارة، نوع خدمة، ومبلغ أكبر من صفر.": "Make sure every row has a car type, service type, and an amount greater than zero.",
  "لا يوجد اتصال — تم حفظ {n} سيارة محلياً وستُرفع تلقائياً عند رجوع النت.": "No connection — {n} car(s) saved locally and will sync automatically once you're back online.",
  "تعذر الاتصال — تم حفظ {n} سيارة محلياً وستُرفع تلقائياً عند رجوع النت.": "Connection failed — {n} car(s) saved locally and will sync automatically once you're back online.",
  "خطأ في حفظ السيارات: ": "Error saving cars: ",
  "تمت إضافة {n} سيارة بنجاح!": "{n} car(s) added successfully!",
  "هل أنت متأكد من حذف هذا السجل؟": "Delete this record?",
  "فشل الحذف: ": "Delete failed: ",
  "تم حذف السجل بنجاح!": "Record deleted successfully!",
  "يجب أن يكون إجمالي المبلغ أكبر من صفر.": "The total amount must be greater than zero.",
  "فشل التحديث: ": "Update failed: ",
  "تم تحديث السجل بنجاح!": "Record updated successfully!",
  "لا يوجد اتصال": "No connection",
  "تعذر الاتصال": "Connection failed",
  " — تم الحفظ محلياً وسيُرفع تلقائياً عند رجوع النت.": " — saved locally and will sync automatically once you're back online.",
  "خطأ في الحفظ: ": "Save error: ",
  "تسجيل السيارات": "Car Entry",
  "سجّل السيارة بضغطة — الأزرار السريعة بالأعلى": "Register a car in one tap — quick buttons above",
  "إدخالات {day}": "Entries for {day}",
  "إدخالات اليوم - {weekday}": "Today's entries - {weekday}",
};

export function t(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  const template = lang === "en" ? EN[text] ?? text : text;
  if (!vars) return template;
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), template);
}
