"use client";
// Display-only translations for the shared worker-link UI. All operational IDs,
// prices, monetary values, status codes and WhatsApp customer messages remain untouched.
export type WorkerLocale="ha-NG"|"en"|"ar";
export const WORKER_LOCALE_KEY="bright_carwash_worker_lang_v1";
const STRINGS={
  "reg.title": {
    "ar": "🚗 تسجيل السيارات",
    "en": "🚗 Register cars",
    "ha-NG": "🚗 Rijistar motoci"
  },
  "reg.pending": {
    "ar": "عمليات بانتظار المزامنة: {n}",
    "en": "Waiting to sync: {n}",
    "ha-NG": "Ana jiran aiki ya daidaita: {n}"
  },
  "reg.syncing": {
    "ar": "جارٍ المزامنة",
    "en": "Syncing…",
    "ha-NG": "Ana daidaitawa…"
  },
  "reg.retry": {
    "ar": "إعادة المزامنة الآن",
    "en": "Retry sync",
    "ha-NG": "Sake daidaitawa"
  },
  "reg.loading": {
    "ar": "جارٍ فتح نموذج تسجيل السيارات...",
    "en": "Loading registration…",
    "ha-NG": "Ana buɗe rijistar mota…"
  },
  "reg.invalid": {
    "ar": "اطلب رابطًا جديدًا من المدير.",
    "en": "Ask the manager for a new link.",
    "ha-NG": "Nemi sabon hanyar shiga daga manaja."
  },
  "reg.draft": {
    "ar": "جارٍ استعادة البيانات...",
    "en": "Restoring draft…",
    "ha-NG": "Ana dawo da bayanan da aka ajiye…"
  },
  "reg.vehicle": {
    "ar": "نوع السيارة",
    "en": "Vehicle type",
    "ha-NG": "Nau'in mota"
  },
  "reg.other": {
    "ar": "أنواع أخرى",
    "en": "Other types",
    "ha-NG": "Sauran nau'o'i"
  },
  "reg.wash": {
    "ar": "الغسيل والسعر",
    "en": "Wash and price",
    "ha-NG": "Wanki da farashi"
  },
  "reg.more": {
    "ar": "المزيد من الخدمات",
    "en": "More services",
    "ha-NG": "Ƙarin ayyuka"
  },
  "reg.less": {
    "ar": "إخفاء الخدمات",
    "en": "Fewer services",
    "ha-NG": "Ɓoye sauran ayyuka"
  },
  "reg.manual": {
    "ar": "تعديل السعر يدويًا",
    "en": "Change price",
    "ha-NG": "Canza farashi"
  },
  "reg.official": {
    "ar": "السعر الرسمي",
    "en": "Official price",
    "ha-NG": "Farashin da aka tsara"
  },
  "reg.service": {
    "ar": "الخدمة",
    "en": "Service",
    "ha-NG": "Aiki"
  },
  "reg.manualPrice": {
    "ar": "السعر لهذه السيارة (SAR)",
    "en": "Price for this car (SAR)",
    "ha-NG": "Farashin wannan motar (SAR)"
  },
  "reg.addons": {
    "ar": "خدمات إضافية (اختياري)",
    "en": "Extras (optional)",
    "ha-NG": "Ƙarin ayyuka (zaɓi ne)"
  },
  "reg.reason": {
    "ar": "سبب تغيير السعر",
    "en": "Reason for price change",
    "ha-NG": "Dalilin sauya farashi"
  },
  "reg.reasonHint": {
    "ar": "سبب السعر اليدوي",
    "en": "Reason for custom price",
    "ha-NG": "Dalilin farashin musamman"
  },
  "reg.discountAdd": {
    "ar": "إضافة خصم (اختياري)",
    "en": "Add discount (optional)",
    "ha-NG": "Ƙara rangwame (zaɓi ne)"
  },
  "reg.discountCancel": {
    "ar": "إلغاء الخصم",
    "en": "Remove discount",
    "ha-NG": "Cire rangwame"
  },
  "reg.discountMax": {
    "ar": "الخصم (الحد {max})",
    "en": "Discount (max {max})",
    "ha-NG": "Rangwame (iyaka {max})"
  },
  "reg.payment": {
    "ar": "طريقة الدفع",
    "en": "Payment method",
    "ha-NG": "Hanyar biyan kuɗi"
  },
  "reg.cash": {
    "ar": "كاش",
    "en": "Cash",
    "ha-NG": "Tsabar kuɗi"
  },
  "reg.pos": {
    "ar": "شبكة",
    "en": "Card / POS",
    "ha-NG": "Kati / POS"
  },
  "reg.mixed": {
    "ar": "مختلط",
    "en": "Mixed",
    "ha-NG": "Biya a haɗe"
  },
  "reg.cashAmount": {
    "ar": "المبلغ كاش",
    "en": "Cash amount",
    "ha-NG": "Kuɗin hannu"
  },
  "reg.posAmount": {
    "ar": "المبلغ شبكة",
    "en": "POS amount",
    "ha-NG": "Kuɗin POS"
  },
  "reg.mismatch": {
    "ar": "مجموع الكاش والشبكة يجب أن يساوي {amount}.",
    "en": "Cash and POS must add up to {amount}.",
    "ha-NG": "Jimillar kuɗin hannu da POS ta zama {amount}."
  },
  "reg.base": {
    "ar": "الخدمة الأساسية",
    "en": "Base wash",
    "ha-NG": "Wankin asali"
  },
  "reg.extras": {
    "ar": "الإضافات",
    "en": "Extras",
    "ha-NG": "Ƙarin ayyuka"
  },
  "reg.discount": {
    "ar": "الخصم",
    "en": "Discount",
    "ha-NG": "Rangwame"
  },
  "reg.total": {
    "ar": "المطلوب تحصيله",
    "en": "Amount to collect",
    "ha-NG": "Adadin da za a karɓa"
  },
  "reg.info": {
    "ar": "معلومات إضافية (اختيارية)",
    "en": "Extra details (optional)",
    "ha-NG": "Ƙarin bayani (zaɓi ne)"
  },
  "reg.notes": {
    "ar": "ملاحظات",
    "en": "Notes",
    "ha-NG": "Bayanan kula"
  },
  "reg.notesHint": {
    "ar": "ملاحظات عن السيارة",
    "en": "Notes about this car",
    "ha-NG": "Bayani kan motar"
  },
  "reg.phone": {
    "ar": "رقم جوال العميل (اختياري)",
    "en": "Customer mobile (optional)",
    "ha-NG": "Lambar wayar abokin ciniki (zaɓi ne)"
  },
  "reg.save": {
    "ar": "تسجيل السيارة",
    "en": "Register car",
    "ha-NG": "Rijistar mota"
  },
  "reg.saving": {
    "ar": "جارٍ الحفظ...",
    "en": "Saving…",
    "ha-NG": "Ana ajiyewa…"
  },
  "reg.success": {
    "ar": "تم تسجيل السيارة بنجاح.",
    "en": "Car registered successfully.",
    "ha-NG": "An yi rajistar motar cikin nasara."
  },
  "reg.queued": {
    "ar": "العملية محفوظة على هذا الجهاز؛ ستُرسل عند توفر الإنترنت.",
    "en": "Saved on this device; it will sync when online.",
    "ha-NG": "An ajiye bayanan a wannan wayar; za a tura su idan intanet ta dawo."
  },
  "reg.offline": {
    "ar": "أنت دون اتصال. التسجيلات ستُزامن تلقائيًا.",
    "en": "You're offline. Entries will sync automatically.",
    "ha-NG": "Babu intanet. Za a tura bayanan kai tsaye idan ta dawo."
  },
  "car.small": {
    "ar": "سيارة صغيرة",
    "en": "Small car",
    "ha-NG": "Ƙaramar mota"
  },
  "car.large": {
    "ar": "سيارة كبيرة",
    "en": "Large car",
    "ha-NG": "Babbar mota"
  },
  "car.truck": {
    "ar": "شاحنة",
    "en": "Truck",
    "ha-NG": "Babbar motar kaya"
  },
  "car.smallBus": {
    "ar": "باص صغير",
    "en": "Minibus",
    "ha-NG": "Ƙaramin bas"
  },
  "car.largeBus": {
    "ar": "باص كبير",
    "en": "Bus",
    "ha-NG": "Babban bas"
  },
  "car.sedan": {
    "ar": "سيدان",
    "en": "Sedan",
    "ha-NG": "Mota Sedan"
  },
  "car.suv": {
    "ar": "دفع رباعي",
    "en": "SUV",
    "ha-NG": "Mota SUV"
  },
  "service.full": {
    "ar": "غسيل كامل",
    "en": "Full wash",
    "ha-NG": "Cikakken wanki"
  },
  "service.exterior": {
    "ar": "غسيل خارجي",
    "en": "Exterior wash",
    "ha-NG": "Wankin waje"
  },
  "service.piston": {
    "ar": "غسيل بستم",
    "en": "Pressure wash",
    "ha-NG": "Wankin matsin lamba"
  },
  "service.custom": {
    "ar": "خدمة أخرى",
    "en": "Other service",
    "ha-NG": "Wani aiki"
  },
  "addon.perfume": {
    "ar": "تعطير",
    "en": "Air freshening",
    "ha-NG": "Sa turare"
  },
  "addon.wax": {
    "ar": "واكس",
    "en": "Wax",
    "ha-NG": "Shafa wax"
  },
  "addon.clean": {
    "ar": "تنظيف إضافي",
    "en": "Extra cleaning",
    "ha-NG": "Ƙarin tsaftacewa"
  },
  "addon.other": {
    "ar": "خدمة إضافية",
    "en": "Extra",
    "ha-NG": "Ƙarin aiki"
  },
  "days.title": {
    "ar": "الأيام غير المعتمدة",
    "en": "Unapproved days",
    "ha-NG": "Ranaku da ba a amince da su ba"
  },
  "days.none": {
    "ar": "لا توجد أيام مفتوحة حاليًا.",
    "en": "No open days.",
    "ha-NG": "Babu ranar da take buɗe yanzu."
  },
  "days.reportNeeded": {
    "ar": "توجد موازنة يوم منتهٍ لم تُرسل.",
    "en": "An ended day still needs a report.",
    "ha-NG": "Akwai ranar da aka gama amma ba a tura rahoto ba."
  },
  "days.pending": {
    "ar": "بانتظار الاعتماد",
    "en": "Awaiting approval",
    "ha-NG": "Ana jiran amincewa"
  },
  "days.unapproved": {
    "ar": "غير معتمد",
    "en": "Not approved",
    "ha-NG": "Ba a amince ba"
  },
  "days.cars": {
    "ar": "السيارات",
    "en": "Cars",
    "ha-NG": "Motoci"
  },
  "days.carUnit": {
    "ar": "{n} سيارة",
    "en": "{n} cars",
    "ha-NG": "Motoci {n}"
  },
  "days.cash": {
    "ar": "الكاش",
    "en": "Cash",
    "ha-NG": "Tsabar kuɗi"
  },
  "days.pos": {
    "ar": "الشبكة",
    "en": "POS",
    "ha-NG": "POS"
  },
  "days.crew": {
    "ar": "مستحقات الفريق",
    "en": "Team share",
    "ha-NG": "Haƙƙin ma'aikata"
  },
  "days.reportSent": {
    "ar": "تم إرسال الموازنة والصورة — بانتظار الاعتماد.",
    "en": "Report and photo sent — awaiting approval.",
    "ha-NG": "An tura rahoto da hoto — ana jiran amincewa."
  },
  "days.lastData": {
    "ar": "تظهر آخر بيانات متاحة.",
    "en": "Showing last available data.",
    "ha-NG": "Ana nuna bayanan ƙarshe."
  },
  "report.title": {
    "ar": "موازنة نهاية يوم {date}",
    "en": "End-of-day report — {date}",
    "ha-NG": "Rahoton ƙarshen rana — {date}"
  },
  "report.cash": {
    "ar": "الكاش الموجود معك (SAR)",
    "en": "Cash on hand (SAR)",
    "ha-NG": "Tsabar kuɗin da ke hannunka (SAR)"
  },
  "report.pos": {
    "ar": "مبلغ الشبكة (SAR)",
    "en": "POS total (SAR)",
    "ha-NG": "Jimillar POS (SAR)"
  },
  "report.terminal": {
    "ar": "المبلغ الظاهر في جهاز الشبكة (SAR)",
    "en": "POS terminal total (SAR)",
    "ha-NG": "Adadin na'urar POS (SAR)"
  },
  "report.photo": {
    "ar": "صورة تقرير جهاز الشبكة",
    "en": "Photo of POS statement",
    "ha-NG": "Hoton rahoton na'urar POS"
  },
  "report.waitSync": {
    "ar": "زامن السيارات المحفوظة أولًا.",
    "en": "Sync saved cars first.",
    "ha-NG": "Da farko a tura bayanan motocin da aka ajiye."
  },
  "report.send": {
    "ar": "إرسال الموازنة للمراجعة",
    "en": "Submit day report",
    "ha-NG": "Tura rahoton rana"
  },
  "report.sending": {
    "ar": "جارٍ إرسال الموازنة...",
    "en": "Submitting report…",
    "ha-NG": "Ana tura rahoto…"
  },
  "report.missing": {
    "ar": "أدخل المبالغ الثلاثة.",
    "en": "Enter all three amounts.",
    "ha-NG": "Shigar da adadin kuɗi uku."
  },
  "report.imageSmaller": {
    "ar": "اختر صورة أصغر.",
    "en": "Choose a smaller photo.",
    "ha-NG": "Zaɓi ƙaramin hoto."
  },
  "report.imageFailed": {
    "ar": "تعذر تجهيز الصورة.",
    "en": "Could not process photo.",
    "ha-NG": "An kasa shirya hoton."
  },
  "report.retry": {
    "ar": "لم يتأكد وصول الموازنة؛ حاول مرة أخرى.",
    "en": "Report not confirmed; try again.",
    "ha-NG": "Ba a tabbatar da rahoton ba; sake gwadawa."
  },
  "ready.title": {
    "ar": "🚘 سيارات اليوم وحالة الجاهزية",
    "en": "🚘 Today's cars and status",
    "ha-NG": "🚘 Motocin yau da halinsu"
  },
  "ready.show": {
    "ar": "عرض ▼",
    "en": "Show ▼",
    "ha-NG": "Nuna ▼"
  },
  "ready.hide": {
    "ar": "إخفاء ▲",
    "en": "Hide ▲",
    "ha-NG": "Ɓoye ▲"
  },
  "ready.archived": {
    "ar": "تظهر السيارات قبل اعتماد اليوم فقط.",
    "en": "Only cars from unapproved days are shown.",
    "ha-NG": "Ana nuna motocin ranakun da ba a amince da su ba kawai."
  },
  "ready.truncated": {
    "ar": "تظهر آخر 250 سيارة فقط.",
    "en": "Showing the latest 250 cars.",
    "ha-NG": "Ana nuna motoci 250 na ƙarshe kawai."
  },
  "ready.none": {
    "ar": "لا توجد سيارات نشطة الآن.",
    "en": "No active cars.",
    "ha-NG": "Babu motoci masu aiki yanzu."
  },
  "ready.date": {
    "ar": "تاريخ",
    "en": "Date",
    "ha-NG": "Rana"
  },
  "ready.time": {
    "ar": "الساعة",
    "en": "Time",
    "ha-NG": "Lokaci"
  },
  "ready.washing": {
    "ar": "قيد الغسيل",
    "en": "Washing",
    "ha-NG": "Ana wankewa"
  },
  "ready.ready": {
    "ar": "جاهزة للاستلام",
    "en": "Ready for collection",
    "ha-NG": "Ta shirya a karɓa"
  },
  "ready.delivered": {
    "ar": "تم التسليم",
    "en": "Delivered",
    "ha-NG": "An miƙa mota"
  },
  "ready.markReady": {
    "ar": "إبلاغ بالجاهزية",
    "en": "Mark ready",
    "ha-NG": "Alama ta shirya"
  },
  "ready.share": {
    "ar": "مشاركة الجاهزية",
    "en": "Share ready notice",
    "ha-NG": "Tura saƙon an gama"
  },
  "ready.markDelivered": {
    "ar": "تم التسليم",
    "en": "Mark delivered",
    "ha-NG": "An miƙa mota"
  },
  "ready.photoOptional": {
    "ar": "صورة السيارة (اختيارية)",
    "en": "Car photo (optional)",
    "ha-NG": "Hoton mota (zaɓi ne)"
  },
  "ready.capture": {
    "ar": "📷 تصوير السيارة",
    "en": "📷 Take photo",
    "ha-NG": "📷 Ɗauki hoto"
  },
  "ready.sharePhoto": {
    "ar": "مشاركة الصورة منفصلًا",
    "en": "Share photo separately",
    "ha-NG": "Tura hoto dabam"
  },
  "ready.confirmDelivery": {
    "ar": "تأكيد تسليم السيارة؟",
    "en": "Confirm car delivery?",
    "ha-NG": "A tabbatar an miƙa motar?"
  },
  "ready.savedReady": {
    "ar": "تم تحديث حالة السيارة.",
    "en": "Car status updated.",
    "ha-NG": "An sabunta halin motar."
  },
  "ready.savedDelivered": {
    "ar": "تم توثيق التسليم.",
    "en": "Delivery recorded.",
    "ha-NG": "An rubuta an miƙa motar."
  },
  "ready.savedPhoto": {
    "ar": "تم حفظ الصورة.",
    "en": "Photo saved.",
    "ha-NG": "An ajiye hoton."
  },
  "ready.noPhone": {
    "ar": "لا يوجد رقم جوال صالح لهذه السيارة.",
    "en": "No valid customer phone for this car.",
    "ha-NG": "Babu ingantacciyar lambar waya ga motar nan."
  },
  "ready.noSharing": {
    "ar": "مشاركة الصور غير متاحة على هذا الجهاز.",
    "en": "Photo sharing isn't supported here.",
    "ha-NG": "Ba a iya tura hoto a wannan wayar ba."
  },
  "ready.shareClosed": {
    "ar": "أُغلقت المشاركة. لا يمكن تأكيد إرسالها.",
    "en": "Share closed. Sending isn't confirmed.",
    "ha-NG": "An rufe rabawa. Ba a tabbatar an aika ba."
  },
  "ready.imageError": {
    "ar": "تعذر مشاركة الصورة.",
    "en": "Could not share photo.",
    "ha-NG": "Ba a iya aika hoton ba."
  },
  "ready.fileEmpty": {
    "ar": "الصورة فارغة.",
    "en": "Photo is empty.",
    "ha-NG": "Hoton babu komai."
  },
  "ready.selectImage": {
    "ar": "اختر صورة.",
    "en": "Select an image.",
    "ha-NG": "Zaɓi hoto."
  },
  "ready.photoLarge": {
    "ar": "الصورة كبيرة جدًا.",
    "en": "Image is too large.",
    "ha-NG": "Hoton ya yi girma sosai."
  },
  "error.generic": {
    "ar": "حدث خطأ. حاول مرة أخرى.",
    "en": "Something went wrong. Try again.",
    "ha-NG": "An samu matsala. Sake gwadawa."
  },
  "error.invalidLink": {
    "ar": "الرابط غير صالح.",
    "en": "Invalid link.",
    "ha-NG": "Hanyar shiga ba ta aiki."
  },
  "error.storage": {
    "ar": "التخزين المحلي غير متاح؛ يلزم الإنترنت.",
    "en": "Local storage unavailable; internet required.",
    "ha-NG": "Ba a iya ajiya a wayar ba; ana buƙatar intanet."
  },
  "error.rejected": {
    "ar": "رُفضت تسجيلات معلقة. راجع المدير.",
    "en": "Some saved entries were rejected. Contact the manager.",
    "ha-NG": "An ƙi wasu bayanai. Tuntuɓi manaja."
  },
  "error.sync": {
    "ar": "فشلت المزامنة. البيانات محفوظة على الجهاز.",
    "en": "Sync failed. Data remains on your device.",
    "ha-NG": "Ba a samu daidaitawa ba. Bayananka suna wayar."
  },
  "error.localRead": {
    "ar": "تعذرت قراءة البيانات المحفوظة.",
    "en": "Could not read saved data.",
    "ha-NG": "Ba a iya karanta bayanan da aka ajiye ba."
  },
  "error.customDisabled": {
    "ar": "تعديل السعر غير مسموح.",
    "en": "Custom pricing is disabled.",
    "ha-NG": "Ba a yarda da sauya farashi ba."
  },
  "error.reason": {
    "ar": "اكتب سبب تعديل السعر.",
    "en": "Enter the reason for changing the price.",
    "ha-NG": "Rubuta dalilin sauya farashi."
  },
  "error.servicePrice": {
    "ar": "الخدمة أو السعر غير صحيح.",
    "en": "Invalid service or price.",
    "ha-NG": "Aikin ko farashin ba daidai ba ne."
  },
  "error.payment": {
    "ar": "راجع الكاش والشبكة والخصم.",
    "en": "Check cash, POS and discount amounts.",
    "ha-NG": "Duba kuɗin hannu, POS da rangwame."
  },
  "error.phone": {
    "ar": "رقم العميل غير صحيح؛ اتركه فارغًا أو صححه.",
    "en": "Invalid customer phone; correct or leave blank.",
    "ha-NG": "Lambar abokin ciniki ba daidai ba ce; gyara ko bar ta."
  },
  "error.uncertain": {
    "ar": "لم يتأكد التسجيل. أعد المحاولة دون تحديث الصفحة.",
    "en": "Not confirmed. Retry without reloading.",
    "ha-NG": "Ba a tabbatar da rajista ba. Sake gwadawa ba tare da sake buɗe shafin ba."
  },
  "error.serverRejected": {
    "ar": "السيرفر رفض التسجيل.",
    "en": "The server rejected the entry.",
    "ha-NG": "Sabar ta ƙi rajistar."
  },
  "error.localSave": {
    "ar": "تعذر الحفظ الآمن؛ لم تُسجل السيارة.",
    "en": "Unable to save securely; car not registered.",
    "ha-NG": "Ba a iya ajiya lafiya ba; ba a yi rijistar motar ba."
  },
  "error.report": {
    "ar": "تعذر إرسال الموازنة.",
    "en": "Could not submit the report.",
    "ha-NG": "Ba a iya tura rahoton ba."
  },
  "error.summary": {
    "ar": "تعذر تحديث الملخص.",
    "en": "Could not update summary.",
    "ha-NG": "Ba a iya sabunta taƙaitaccen bayani ba."
  },
  "error.cars": {
    "ar": "تعذر تحميل السيارات.",
    "en": "Could not load cars.",
    "ha-NG": "Ba a iya buɗe motocin ba."
  },
  "error.update": {
    "ar": "تعذر تحديث حالة السيارة.",
    "en": "Could not update car status.",
    "ha-NG": "Ba a iya sabunta halin motar ba."
  },
  "error.upload": {
    "ar": "تعذر حفظ الصورة.",
    "en": "Could not save photo.",
    "ha-NG": "Ba a iya ajiye hoton ba."
  },
  "error.session": {
    "ar": "جلسة المدير غير متاحة.",
    "en": "Manager session unavailable.",
    "ha-NG": "Ba a samu zaman manaja ba."
  },
  "error.offline": {
    "ar": "لا يوجد اتصال؛ التسجيل محفوظ على الجهاز.",
    "en": "Offline. Registration saved on device.",
    "ha-NG": "Babu intanet; an ajiye rajista a wayar."
  }
} as const;
export type WorkerKey=keyof typeof STRINGS;
export function workerText(lang:WorkerLocale,key:WorkerKey,vars?:Record<string,string|number>):string{
 const template:string=STRINGS[key][lang];
 return vars?template.replace(/\{(\w+)\}/g,(_,k:string)=>String(vars[k]??"")):template;
}
export function workerDirection(lang:WorkerLocale):"ltr"|"rtl"{return lang==="ar"?"rtl":"ltr";}
export function readWorkerLocale():WorkerLocale{
 if(typeof window==="undefined")return "ha-NG";
 try{
  const saved=window.localStorage.getItem(WORKER_LOCALE_KEY);
  if(saved==="ha-NG"||saved==="en"||saved==="ar")return saved;
  const cookie=document.cookie.match(/(?:^|; )carwash_worker_lang=(ha-NG|en|ar)(?:;|$)/);
  if(cookie)return cookie[1] as WorkerLocale;
 }catch{/* Browsers can block storage. */}
 return "ha-NG";
}
export function persistWorkerLocale(lang:WorkerLocale):void{
 if(typeof window==="undefined")return;
 try{localStorage.setItem(WORKER_LOCALE_KEY,lang);}catch{}
 try{document.cookie="carwash_worker_lang="+lang+"; Path=/w; Max-Age=31536000; SameSite=Lax";}catch{}
}
const CAR:Record<string,WorkerKey>={
 "سيارة صغيرة":"car.small","سيارة كبيرة":"car.large","شاحنة":"car.truck",
 "باص صغير":"car.smallBus","باص كبير":"car.largeBus","سيدان":"car.sedan","SUV":"car.suv"
};
const SERVICE:Record<string,WorkerKey>={
 "غسيل كامل":"service.full","غسيل خارجي":"service.exterior","غسيل بستم":"service.piston"
};
const ADDON:Record<string,WorkerKey>={
 "تعطير":"addon.perfume","واكس":"addon.wax","تنظيف إضافي":"addon.clean"
};
export function workerCarName(lang:WorkerLocale,name:string):string{
 return CAR[name]?workerText(lang,CAR[name]):lang==="ar"?name:workerText(lang,"service.custom");
}
export function workerServiceName(lang:WorkerLocale,name:string):string{
 return SERVICE[name]?workerText(lang,SERVICE[name]):lang==="ar"?name:workerText(lang,"service.custom");
}
export function workerAddonName(lang:WorkerLocale,name:string):string{
 return ADDON[name]?workerText(lang,ADDON[name]):lang==="ar"?name:workerText(lang,"addon.other");
}
export function workerMoney(value:number):string{
 return new Intl.NumberFormat("en-US",{maximumFractionDigits:2,minimumFractionDigits:2}).format(value)+" SAR";
}
export function workerDate(date:string,lang:WorkerLocale):string{
 const locale=lang==="ar"?"ar-SA-u-ca-gregory-nu-latn":"en-GB";
 return new Date(date+"T12:00:00+03:00").toLocaleDateString(locale,
  {timeZone:"Asia/Riyadh",year:"numeric",month:"short",day:"numeric"});
}
export function workerTime(date:string,lang:WorkerLocale):string{
 const locale=lang==="ar"?"ar-SA-u-ca-gregory-nu-latn":"en-GB";
 return new Date(date).toLocaleTimeString(locale,
  {timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit"});
}
// Backend messages may be Arabic, and are untrusted display data. Never expose
// untranslated server output or database internals to Hausa/English users.
export function workerMessage(lang:WorkerLocale,raw:string,fallback:WorkerKey="error.generic"):string{
 if(lang==="ar")return raw||workerText(lang,fallback);
 for(const [key,translations] of Object.entries(STRINGS)){
  if(translations.ar===raw)return workerText(lang,key as WorkerKey);
 }
 if(/مزامن|sync/i.test(raw))return workerText(lang,"error.sync");
 if(/السعر|price|discount|الخصم/i.test(raw))return workerText(lang,"error.payment");
 if(/رابط|link|صلاحية|authorization/i.test(raw))return workerText(lang,"error.invalidLink");
 if(/رقم|phone/i.test(raw))return workerText(lang,"error.phone");
 if(/صورة|photo|image/i.test(raw))return workerText(lang,"error.upload");
 return workerText(lang,fallback);
}
