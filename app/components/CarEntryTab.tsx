"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";
import {
  AR_GREGORIAN_LOCALE,
  formatCurrency,
  getDayBounds,
  getOperationalShiftBounds,
  getPaymentMethod,
  resolveOccurredAt,
  toDateKey,
  type EntryDayChoice,
} from "@/lib/business";
import { showToast } from "@/lib/toast";
import type { Entry, EntryPreset } from "@/lib/types";
import { enqueue, getQueueByTable } from "@/lib/offlineQueue";
import { normalizeSaudiMobile } from "@/lib/phone";
import { isNetworkError } from "@/lib/offlineSync";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/lib/settings";
import { loadPresets, suggestionsFor } from "@/lib/presets";
import { BREAKEVEN_WINDOW_DAYS, computeBreakEven, type BreakEven } from "@/lib/breakeven";
import { getLang, setLang as persistLang, t, type Lang } from "@/lib/i18n";
import { crewProvisionForCarCount } from "@/lib/carwashCompensation";
import { isApprovedStaffPrice, selectedAddonsTotal, type CatalogAddon } from "@/lib/priceGovernance";
import { workerShiftSummary } from "@/lib/workerShiftSummary";
import { queueLength } from "@/lib/offlineQueue";
import { MetricCard } from "./MetricCard";
import { Modal } from "./Modal";
import { PresetGrid } from "./PresetGrid";
import { BreakEvenMeter } from "./BreakEvenMeter";
import { EntryRow } from "./EntryRow";
import { LangSwitch } from "./LangSwitch";

function pendingEntriesFromQueue(): Entry[] {
  return getQueueByTable("entries").map((item) => {
    const p = item.payload as Record<string, string | number | null>;
    const cash = Number(p.cash_paid) || 0;
    const card = Number(p.card_paid) || 0;
    return {
      id: `pending-${item.id}`,
      car_type: String(p.car_type || ""),
      service_type: String(p.service_type || ""),
      cash_paid: cash,
      card_paid: card,
      gross: cash + card,
      payment_method: getPaymentMethod(cash, card),
      notes: (p.notes as string | null) ?? null,
      occurred_at: String(p.occurred_at),
      worker_name: p.worker_name ? String(p.worker_name) : null,
      customer_phone: p.customer_phone ? String(p.customer_phone) : null,
      discount_amount: Number(p.discount_amount) || 0,
      ready_at: null,
      shift_id: p.shift_id ? String(p.shift_id) : null,
      pending: true,
    };
  });
}

type BulkRow = { carType: string; serviceType: string; cash: string; card: string; notes: string };

function emptyBulkRow(prefill?: Partial<BulkRow>): BulkRow {
  return { carType: "", serviceType: "", cash: "", card: "", notes: "", ...prefill };
}

export function CarEntryTab({ ownerView = true }: { ownerView?: boolean }) {
  const [carTypes, setCarTypes] = useState<string[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [performers, setPerformers] = useState<string[]>([]);
  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [shiftEntries, setShiftEntries] = useState<Entry[]>([]);
  const [monthEntries, setMonthEntries] = useState<Entry[]>([]);
  const [pendingEntries, setPendingEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showTodayModal, setShowTodayModal] = useState(false);
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [detailFilter, setDetailFilter] = useState<"all"|"cash"|"card">("all");
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [shiftStatus, setShiftStatus] = useState<"open"|"awaiting_owner"|"approved"|null>(null);
  const [deviceId,setDeviceId] = useState<string|null>(null);
  const lastRegisteredShift = useRef<string|null>(null);
  const knownShiftId = useRef<string|null>(null);
  const [deviceSeal,setDeviceSeal] = useState<"unsealed"|"sealed"|"sealing">("unsealed");
  const [shiftError,setShiftError] = useState("");

  const [carType, setCarType] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [performer, setPerformer] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [cardPaid, setCardPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [readyBusy, setReadyBusy] = useState<string | null>(null);

  const [presets, setPresets] = useState<EntryPreset[]>([]);
  const [addons,setAddons] = useState<CatalogAddon[]>([]);
  const [selectedAddons,setSelectedAddons] = useState<string[]>([]);
  const [goal, setGoal] = useState<BreakEven | null>(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow()]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // يوم التسجيل — لتصحيح سيارات تُضاف متأخرة (بعد منتصف الليل أو نسيان يوم كامل).
  // يرجع "اليوم" تلقائياً بكل تحميل جديد للصفحة عشان ما يبقى عالقاً على يوم قديم بالغلط.
  const [entryDay, setEntryDay] = useState<EntryDayChoice>("today");
  const [customDate, setCustomDate] = useState("");

  // لغة صفحة تسجيل السيارات فقط — تُحفظ بالجهاز، وباقي النظام يبقى عربي.
  const [lang, setLangState] = useState<Lang>("ar");
  useEffect(() => {
    setLangState(getLang());
  }, []);
  function changeLang(next: Lang) {
    setLangState(next);
    persistLang(next);
  }
  const tt = (text: string, vars?: Record<string, string | number>) => t(lang, text, vars);
  const dateLocale = lang === "en" ? "en-US" : AR_GREGORIAN_LOCALE;

  const loadLists = useCallback(async () => {
    const [{ data: cars }, { data: services }, { data: staff }, { data: addonItems }] = await Promise.all([
      supabase.from("car_types").select("name").eq("active", true).order("sort_order"),
      supabase.from("service_types").select("name").eq("active", true).order("sort_order"),
      supabase.from("workers").select("name").eq("active", true).order("sort_order"),
      supabase.from("carwash_addons").select("id,name,price,active").eq("active",true).order("name"),
    ]);
    setCarTypes((cars || []).map((c) => c.name));
    setServiceTypes((services || []).map((s) => s.name));
    setPerformers((staff || []).map((s) => s.name));
    setPresets(await loadPresets());
    setAddons((addonItems||[]) as CatalogAddon[]);
  }, []);

  const loadToday = useCallback(async () => {
    if (!ownerView) {
      if (!activeShiftId) { setTodayEntries([]); return; }
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const rows = await fetchAllRows<Entry>((from,to)=>
        supabase.from("entries").select("*").is("deleted_at",null)
          .eq("shift_id",activeShiftId).order("occurred_at",{ascending:false}).range(from,to)
      );
      setTodayEntries(rows);
      return;
    }
    const { start, end } = getDayBounds(new Date());
    const { data, error } = await supabase.from("entries")
      .select("*").is("deleted_at",null)
      .gte("occurred_at",start.toISOString()).lt("occurred_at",end.toISOString())
      .order("occurred_at",{ascending:false});
    if (!error) setTodayEntries((data as Entry[])||[]);
  },[ownerView,activeShiftId]);

  const loadShift = useCallback(async () => {
    if (!activeShiftId) { setShiftEntries([]); return; }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const rows=await fetchAllRows<Entry>((from,to)=>
      supabase.from("entries").select("*").is("deleted_at",null)
        .eq("shift_id",activeShiftId).order("occurred_at",{ascending:false}).range(from,to)
    );
    setShiftEntries(rows);
  },[activeShiftId]);

  const loadMonth = useCallback(async () => {
    if (!ownerView) { setMonthEntries([]); return; }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const data = await fetchAllRows<Entry>((from, to) =>
      supabase
        .from("entries")
        .select("*")
        .is("deleted_at", null)
        .gte("occurred_at", start.toISOString())
        .lt("occurred_at", end.toISOString())
        .order("occurred_at", { ascending: false })
        .range(from, to)
    );
    setMonthEntries(data);
  }, [ownerView]);

  const loadGoal = useCallback(async (currentSettings: AppSettings) => {
    if (!ownerView) { setGoal(null); return; }
    const since = new Date();
    since.setDate(since.getDate() - BREAKEVEN_WINDOW_DAYS);
    const sinceIso = since.toISOString();

    const [exp, ent] = await Promise.all([
      fetchAllRows<{ amount: number }>((from, to) =>
        supabase.from("expenses").select("amount").is("deleted_at", null).gte("occurred_at", sinceIso).range(from, to)
      ),
      fetchAllRows<{ gross: number }>((from, to) =>
        supabase.from("entries").select("gross").is("deleted_at", null).gte("occurred_at", sinceIso).range(from, to)
      ),
    ]);

    const windowExpenses = exp.reduce((sum, r) => sum + Number(r.amount), 0);
    const windowRevenue = ent.reduce((sum, r) => sum + Number(r.gross), 0);

    setGoal(computeBreakEven({
      windowExpenses,
      windowRevenue,
      windowEntries: ent.length,
      windowDays: BREAKEVEN_WINDOW_DAYS,
      manualDailyTarget: currentSettings.daily_expense_target,
    }));
  }, [ownerView]);

  const refreshAll = useCallback((currentSettings: AppSettings) => {
    loadToday();
    loadMonth();
    loadShift();
    loadGoal(currentSettings);
  }, [loadToday, loadMonth, loadShift, loadGoal]);

  useEffect(() => {
    loadLists();
    loadSettings().then((s) => {
      setSettings(s);
      settingsRef.current = s;
      refreshAll(s);
    });
    setPendingEntries(pendingEntriesFromQueue());
    const refreshPending = () => setPendingEntries(pendingEntriesFromQueue());
    window.addEventListener("offline-queue-changed", refreshPending);
    const channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => refreshAll(settingsRef.current))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("offline-queue-changed", refreshPending);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each signed-in device gets the current server shift. Once manager approves,
  // the active shift changes and worker totals reset without deleting history.
  useEffect(() => {
    let cancelled=false;
    let staffDevice: string|null=null;
    if (!ownerView) {
      const raw=localStorage.getItem("carwash_device_id_v2");
      staffDevice=raw && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(raw) ? raw : crypto.randomUUID();
      localStorage.setItem("carwash_device_id_v2",staffDevice);
      setDeviceId(staffDevice);
      const cached=localStorage.getItem("carwash_active_shift_v2");
      if(cached){knownShiftId.current=cached;setActiveShiftId(cached);setShiftStatus("open");}
    }
    async function checkShift() {
      if(!navigator.onLine)return;
      const {data,error}=await supabase.from("carwash_shifts")
        .select("id,status").in("status",["open","awaiting_owner"])
        .order("opened_at",{ascending:false}).limit(1).maybeSingle();
      if(cancelled)return;
      if(error){setShiftError("تعذر التحقق من الوردية: "+error.message);return;}
      const next=data?.id||null;
      setShiftStatus((data?.status as "open"|"awaiting_owner")||null);
      if(knownShiftId.current!==next){
        knownShiftId.current=next;
        setTodayEntries([]);setShiftEntries([]);setActiveShiftId(next);setSelectedEntry(null);
        if(next)localStorage.setItem("carwash_active_shift_v2",next);
        else localStorage.removeItem("carwash_active_shift_v2");
        lastRegisteredShift.current=null;
        setDeviceSeal("unsealed");
      }
      if(!ownerView && next && data?.status==="open" && staffDevice &&
        lastRegisteredShift.current!==next){
        const result=await supabase.rpc("register_carwash_device",
          {p_device_id:staffDevice,p_shift_id:next});
        if(cancelled)return;
        if(result.error)setShiftError("تعذر تسجيل الجهاز: "+result.error.message);
        else {lastRegisteredShift.current=next;setShiftError("");}
      }else setShiftError("");
      // A sealed device stays sealed on page refresh; merely checking in
      // must not allow new arrivals or unblock manager settlement incorrectly.
      if(!ownerView && next && staffDevice && data?.status==="open"){
        const checked=await supabase.from("carwash_shift_devices")
          .select("sealed_at").eq("shift_id",next)
          .eq("device_id",staffDevice).maybeSingle();
        if(!cancelled && !checked.error && checked.data?.sealed_at)
          setDeviceSeal("sealed");
      }
    }
    void checkShift();
    const timer=setInterval(()=>void checkShift(),12000);
    const onResume=()=>{if(!document.hidden)void checkShift();};
    const onOnline=()=>void checkShift();
    window.addEventListener("online",onOnline);
    document.addEventListener("visibilitychange",onResume);
    return()=>{cancelled=true;clearInterval(timer);
      window.removeEventListener("online",onOnline);
      document.removeEventListener("visibilitychange",onResume);
    };
  },[ownerView]);

  useEffect(()=>{
    void loadToday();void loadShift();
    const timer=setInterval(()=>{if(navigator.onLine){void loadToday();void loadShift();}},12000);
    return()=>clearInterval(timer);
  },[loadToday,loadShift]);

  async function sealStaffDevice(){
    if(!activeShiftId||!deviceId||shiftStatus!=="open"){
      showToast("لا توجد وردية مفتوحة لتأكيدها.","warning");return;
    }
    if(!navigator.onLine||queueLength()>0){
      showToast("زامن جميع التسجيلات أولًا؛ لا يمكن تأكيد جهاز عليه عمليات معلقة.","warning");return;
    }
    if(!confirm("تأكيد اكتمال تسجيلات هذا الجهاز؟ لا يستطيع المدير اعتماد الموازنة إلا بعد تأكيد جميع الأجهزة."))return;
    setDeviceSeal("sealing");
    const {error}=await supabase.rpc("seal_carwash_device",
      {p_device_id:deviceId,p_shift_id:activeShiftId});
    if(error){setDeviceSeal("unsealed");showToast(error.message,"error");return;}
    setDeviceSeal("sealed");showToast("تم تأكيد مزامنة الجهاز؛ يمكن للمدير مراجعة الموازنة.");
  }

  const todayEntriesWithPending = useMemo(() => {
    if (!ownerView) {
      if (!activeShiftId) return [];
      return [
        ...pendingEntries.filter(e=>e.shift_id===activeShiftId),
        ...todayEntries.filter(e=>e.shift_id===activeShiftId),
      ];
    }
    const { start, end } = getDayBounds(new Date());
    const relevant = pendingEntries.filter((e) => {
      const t = new Date(e.occurred_at);
      return t >= start && t < end;
    });
    return [...relevant, ...todayEntries];
  }, [todayEntries,pendingEntries,ownerView,activeShiftId]);

  const monthEntriesWithPending = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const relevant = pendingEntries.filter((e) => {
      const t = new Date(e.occurred_at);
      return t >= start && t < end;
    });
    return [...relevant, ...monthEntries];
  }, [monthEntries, pendingEntries]);

  const dailyTotals = useMemo(() => {
    const cash = todayEntriesWithPending.reduce((s, e) => s + Number(e.cash_paid), 0);
    const card = todayEntriesWithPending.reduce((s, e) => s + Number(e.card_paid), 0);
    return { count: todayEntriesWithPending.length, cash, card, total: cash + card };
  }, [todayEntriesWithPending]);

  const shiftCarCount = useMemo(()=>
    shiftEntries.filter(e=>e.shift_id===activeShiftId).length
    + pendingEntries.filter(e=>e.shift_id===activeShiftId).length,
    [shiftEntries,pendingEntries,activeShiftId]);
  const workerSummary = useMemo(
    ()=>workerShiftSummary(todayEntriesWithPending,activeShiftId),
    [todayEntriesWithPending,activeShiftId]
  );

  const crewProvision = useMemo(() => crewProvisionForCarCount(shiftCarCount), [shiftCarCount]);

  const monthlyByDay = useMemo(() => {
    const map = new Map<string, { cars: number; cash: number; card: number; total: number }>();
    monthEntriesWithPending.forEach((e) => {
      const key = toDateKey(new Date(e.occurred_at));
      const row = map.get(key) || { cars: 0, cash: 0, card: 0, total: 0 };
      row.cars += 1;
      row.cash += Number(e.cash_paid);
      row.card += Number(e.card_paid);
      row.total += Number(e.gross);
      map.set(key, row);
    });
    return Array.from(map.entries())
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [monthEntriesWithPending]);

  function clearForm() {
    setCarType("");
    setServiceType("");
    setCashPaid("");
    setCardPaid("");
    setNotes("");
    setDiscountAmount("");
    setCustomerPhone("");
    setSmsConsent(false);
    setSelectedAddons([]);
  }

  // مسار الحفظ الموحّد: يستخدمه النموذج اليدوي والأزرار الجاهزة معاً، فيمر
  // الاثنان بنفس منطق الطابور المحلي عند انقطاع الشبكة.
  async function saveEntry(payload: Record<string, unknown>, successMessage: string): Promise<boolean> {
    if(deviceSeal==="sealed"&&!ownerView){showToast("أكدت اكتمال تسجيلات جهازك. انتظر اعتماد الوردية الجديدة.","warning");return false;}
    if(!activeShiftId||shiftStatus!=="open"){
      showToast("الوردية غير مفتوحة؛ انتظر اعتماد المدير أو أعد الاتصال.","warning");return false;
    }
    if(!ownerView && (!deviceId || (navigator.onLine && lastRegisteredShift.current!==activeShiftId))){
      showToast("يتطلب تسجيل الجهاز اتصالًا بالإنترنت لأول مرة في الوردية.","warning");return false;
    }
    const mutation={...payload,shift_id:activeShiftId,
      ...(!ownerView?{device_id:deviceId}:{}),
      client_mutation_id:crypto.randomUUID()};
    setDeviceSeal("unsealed");
    const queueLocally = (reason: string) => {
      enqueue("entries", mutation);
      showToast(`${tt(reason)}${tt(" — تم الحفظ محلياً وسيُرفع تلقائياً عند رجوع النت.")}`, "warning");
    };

    if (!navigator.onLine) {
      queueLocally("لا يوجد اتصال");
      return true;
    }

    const { error } = await supabase.from("entries").insert(mutation);
    if (error) {
      if (isNetworkError(error)) {
        queueLocally("تعذر الاتصال");
        return true;
      }
      showToast(tt("خطأ في الحفظ: ") + error.message, "error");
      return false;
    }

    showToast(successMessage);
    refreshAll(settingsRef.current);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cash = Number(cashPaid) || 0;
    const card = Number(cardPaid) || 0;
    const discount = Number(discountAmount) || 0;
    const normalizedPhone = customerPhone.trim() ? normalizeSaudiMobile(customerPhone) : null;
    if (!Number.isFinite(discount) || discount < 0 || (!ownerView && discount > 10)) {
      showToast("الحد الأقصى لخصم حساب العمال هو 10 ريالات لكل سيارة.", "warning");
      return;
    }
    if (customerPhone.trim() && !normalizedPhone) {
      showToast("رقم جوال العميل غير صحيح؛ أصلحه أو اتركه فارغًا.", "warning");
      return;
    }
    if (normalizedPhone && !smsConsent) {
      showToast("احصل على موافقة العميل على رسالة الجاهزية أو احذف رقم الجوال.", "warning");
      return;
    }
    if (!carType || !serviceType) {
      showToast(tt("يرجى اختيار نوع السيارة ونوع الخدمة."), "warning");
      return;
    }
    if (cash + card <= 0) {
      showToast(tt("الرجاء إدخال مبلغ صحيح."), "warning");
      return;
    }
    if(!ownerView){
      try{
        if(!isApprovedStaffPrice({
          carType,serviceType,cash,card,discount,presets,addons,selectedAddons
        })){
          showToast("يجب أن يتطابق السعر مع سعر الخدمة المعتمد والإضافات المختارة، بعد الخصم.","warning");
          return;
        }
      }catch(cause){
        showToast("راجع الإضافات المختارة: "+(cause instanceof Error?cause.message:"اختيار غير صالح"),"warning");return;
      }
    }
    if (entryDay === "custom" && !customDate) {
      showToast(tt("اختر التاريخ أولاً."), "warning");
      return;
    }
    setSubmitting(true);
    const ok = await saveEntry(
      {
        car_type: carType,
        service_type: serviceType,
        cash_paid: cash,
        card_paid: card,
        discount_amount: discount,
        addon_ids: selectedAddons,
        customer_phone: normalizedPhone,
        sms_consent: !!normalizedPhone && smsConsent,
        notes: notes || null,
        worker_name: ownerView ? performer || null : null,
        occurred_at: resolveOccurredAt(entryDay, customDate),
      },
      tt("تمت إضافة السيارة بنجاح!")
    );
    setSubmitting(false);
    if (ok) clearForm();
  }

  async function handlePresetPick(preset: EntryPreset, method: "cash" | "card") {
    const discount = Number(discountAmount) || 0;
    const normalizedPhone = customerPhone.trim() ? normalizeSaudiMobile(customerPhone) : null;
    if (!Number.isFinite(discount) || discount < 0 || (!ownerView && discount > 10) || discount >= preset.amount) {
      showToast("الخصم يتجاوز السعر أو الحد المسموح.", "warning");
      return;
    }
    if ((customerPhone.trim() && !normalizedPhone) || (normalizedPhone && !smsConsent)) {
      showToast("راجع رقم جوال العميل والموافقة على رسالة الجاهزية.", "warning");
      return;
    }
    if (entryDay === "custom" && !customDate) {
      showToast(tt("اختر التاريخ أولاً."), "warning");
      return;
    }
    const extrasTotal=selectedAddonsTotal(addons,selectedAddons);
    setSubmitting(true);
    const net = Number((preset.amount + extrasTotal - discount).toFixed(2));
    const saved = await saveEntry(
      {
        car_type: preset.car_type,
        service_type: preset.service_type,
        cash_paid: method === "cash" ? net : 0,
        card_paid: method === "card" ? net : 0,
        discount_amount: discount,
        addon_ids: selectedAddons,
        customer_phone: normalizedPhone,
        sms_consent: !!normalizedPhone && smsConsent,
        notes: null,
        worker_name: performer || null,
        occurred_at: resolveOccurredAt(entryDay, customDate),
      },
      `${tt("تم تسجيل")} ${preset.car_type} · ${formatCurrency(net)}`
    );
    setSubmitting(false);
    if (saved) clearForm();
  }

  async function requestReady(entry: Entry) {
    if (entry.ready_at) return;
    const isLocallyPending = entry.id.startsWith("pending-");
    const payload: { p_entry_id?: string; p_client_mutation_id?: string } =
      isLocallyPending ? { p_client_mutation_id: entry.id.slice("pending-".length) } : { p_entry_id: entry.id };
    if (getQueueByTable("ready_notice").some(item =>
      (payload.p_entry_id && item.payload.p_entry_id === payload.p_entry_id)
      || (payload.p_client_mutation_id && item.payload.p_client_mutation_id === payload.p_client_mutation_id))) {
      showToast("طلب الجاهزية محفوظ بالفعل بانتظار المزامنة.", "warning");
      return;
    }
    if (!confirm("هل انتهى الغسيل وتريد تسجيل جاهزية السيارة وإعداد إشعار العميل؟")) return;
    setReadyBusy(entry.id);
    if (isLocallyPending || !navigator.onLine) {
      enqueue("ready_notice", payload);
      showToast("تم حفظ طلب الجاهزية محليًا. لن تُرسل الرسالة قبل المزامنة وتفعيل مزود SMS.", "warning");
      setReadyBusy(null);
      return;
    }
    const { data, error } = await supabase.rpc("request_ready_notice", payload);
    if (error) {
      if (isNetworkError(error)) {
        enqueue("ready_notice", payload);
        showToast("تعذر الاتصال؛ تم حفظ الطلب محليًا.", "warning");
      } else showToast("تعذر تسجيل الجاهزية: " + error.message, "error");
    } else if (data === "pending_provider") {
      showToast("تم تسجيل الجاهزية، والإشعار ينتظر تفعيل مزود SMS.", "warning");
    } else {
      showToast("تم تسجيل الجاهزية دون إرسال رسالة.");
    }
    setReadyBusy(null);
    refreshAll(settingsRef.current);
  }

  function updateBulkRow(index: number, patch: Partial<BulkRow>) {
    setBulkRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addBulkRow() {
    setBulkRows((rows) => {
      const last = rows[rows.length - 1];
      return [...rows, emptyBulkRow({ carType: last?.carType, serviceType: last?.serviceType })];
    });
  }

  function removeBulkRow(index: number) {
    setBulkRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if(!ownerView)return;
    if(!activeShiftId||shiftStatus!=="open"){
      showToast("لا يمكن إضافة سيارات إلى وردية مغلقة.","warning");return;
    }
    if (entryDay === "custom" && !customDate) {
      showToast("اختر التاريخ أولاً.", "warning");
      return;
    }
    const occurredAt = resolveOccurredAt(entryDay, customDate);
    const payloads = bulkRows.map((row) => ({
      car_type: row.carType,
      service_type: row.serviceType,
      cash_paid: Number(row.cash) || 0,
      card_paid: Number(row.card) || 0,
      notes: row.notes || null,
      worker_name: performer || null,
      occurred_at: occurredAt,
      client_mutation_id: crypto.randomUUID(),
      shift_id: activeShiftId,
    }));

    const invalid = payloads.find((p) => !p.car_type || !p.service_type || p.cash_paid + p.card_paid <= 0);
    if (invalid) {
      showToast(tt("تأكد إن كل سطر فيه نوع سيارة، نوع خدمة، ومبلغ أكبر من صفر."), "warning");
      return;
    }

    setBulkSubmitting(true);

    if (!navigator.onLine) {
      payloads.forEach((p) => enqueue("entries", p));
      setBulkSubmitting(false);
      showToast(tt("لا يوجد اتصال — تم حفظ {n} سيارة محلياً وستُرفع تلقائياً عند رجوع النت.", { n: payloads.length }), "warning");
      setBulkRows([emptyBulkRow()]);
      return;
    }

    const { error } = await supabase.from("entries").insert(payloads);
    setBulkSubmitting(false);
    if (error) {
      if (isNetworkError(error)) {
        payloads.forEach((p) => enqueue("entries", p));
        showToast(tt("تعذر الاتصال — تم حفظ {n} سيارة محلياً وستُرفع تلقائياً عند رجوع النت.", { n: payloads.length }), "warning");
        setBulkRows([emptyBulkRow()]);
        return;
      }
      showToast(tt("خطأ في حفظ السيارات: ") + error.message, "error");
      return;
    }

    showToast(tt("تمت إضافة {n} سيارة بنجاح!", { n: payloads.length }));
    setBulkRows([emptyBulkRow()]);
    refreshAll(settingsRef.current);
  }

  async function handleDelete(id: string) {
    if (!confirm(tt("هل أنت متأكد من حذف هذا السجل؟"))) return;
    const { error } = await supabase.from("entries").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      showToast(tt("فشل الحذف: ") + error.message, "error");
      return;
    }
    showToast(tt("تم حذف السجل بنجاح!"));
    refreshAll(settingsRef.current);
  }

  async function handleUpdate(entry: Entry, patch: Partial<Entry>) {
    const cash = Number(patch.cash_paid ?? entry.cash_paid);
    const card = Number(patch.card_paid ?? entry.card_paid);
    if (cash + card <= 0) {
      showToast(tt("يجب أن يكون إجمالي المبلغ أكبر من صفر."), "warning");
      return;
    }
    const { error } = await supabase
      .from("entries")
      .update({
        car_type: patch.car_type ?? entry.car_type,
        service_type: patch.service_type ?? entry.service_type,
        cash_paid: cash,
        card_paid: card,
        notes: patch.notes ?? entry.notes,
        occurred_at: patch.occurred_at ?? entry.occurred_at,
      })
      .eq("id", entry.id);
    if (error) {
      showToast(tt("فشل التحديث: ") + error.message, "error");
      return;
    }
    showToast(tt("تم تحديث السجل بنجاح!"));
    setEditingId(null);
    refreshAll(settingsRef.current);
  }

  const dayEntries = selectedDay ? monthEntriesWithPending.filter((e) => toDateKey(new Date(e.occurred_at)) === selectedDay) : [];
  const visibleDetailEntries = todayEntriesWithPending.filter(e => detailFilter==="all" || (detailFilter==="cash" ? Number(e.cash_paid)>0 : Number(e.card_paid)>0));

  const priceSuggestions = suggestionsFor(presets, carType, serviceType);

  const resolvedEntryDateLabel = useMemo(() => {
    const iso = resolveOccurredAt(entryDay, customDate);
    return new Date(iso).toLocaleDateString(dateLocale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }, [entryDay, customDate, dateLocale]);

  return (
    <div className="space-y-6" dir={lang === "en" ? "ltr" : "rtl"}>
      <div className="flex justify-end">
        <LangSwitch lang={lang} onChange={changeLang} />
      </div>

      {ownerView && goal && (
        <BreakEvenMeter
          goal={goal}
          carsToday={dailyTotals.count}
          revenueToday={dailyTotals.total}
          ownerView={ownerView}
          lang={lang}
        />
      )}

      {ownerView && <section className="card">
        <span className="form-label">{tt("تاريخ التسجيل")}</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={entryDay === "today" ? "btn-primary" : "btn-secondary"} onClick={() => setEntryDay("today")}>{tt("اليوم")}</button>
          <button type="button" className={entryDay === "yesterday" ? "btn-primary" : "btn-secondary"} onClick={() => setEntryDay("yesterday")}>{tt("أمس")}</button>
          <button type="button" className={entryDay === "custom" ? "btn-primary" : "btn-secondary"} onClick={() => setEntryDay("custom")}>{tt("تاريخ آخر")}</button>
        </div>
        {entryDay === "custom" && (
          <div className="mt-3" style={{ maxWidth: 220 }}>
            <input type="date" value={customDate} max={toDateKey(new Date())} onChange={(e) => setCustomDate(e.target.value)} />
          </div>
        )}
        {entryDay !== "today" && (
          <p className="txt-warning font-bold text-sm mt-3">
            {tt("⚠️ السيارات المُضافة الآن ستُسجَّل ليوم {date}", { date: resolvedEntryDateLabel })}
          </p>
        )}
      </section>}

      {addons.length>0&&<section className="card">
        <h2 className="section-title">خدمات إضافية — اختيارية</h2>
        <p className="txt-muted text-sm">سعر كل إضافة يُضاف إلى سعر الغسيل المعتمد، والخصم يُحسب بشكل منفصل.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {addons.map(addon=><label key={addon.id} className="flex justify-between items-center gap-2 rounded-xl border p-3">
            <span><input type="checkbox" checked={selectedAddons.includes(addon.id)} onChange={e=>
              setSelectedAddons(old=>e.target.checked?[...old,addon.id]:old.filter(v=>v!==addon.id))} />
              <span className="ms-2">{addon.name}</span></span>
            <strong>{formatCurrency(addon.price)}</strong>
          </label>)}
        </div>
        <p className="text-sm font-semibold mt-3">
          قيمة الإضافات: {formatCurrency(selectedAddonsTotal(addons,selectedAddons))}
        </p>
      </section>}

      <section className="card">
        <h2 className="section-title">رقم العميل لإشعار الجاهزية — اختياري</h2>
        <input type="tel" inputMode="tel" placeholder="05XXXXXXXX" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
        {customerPhone.trim() && (
          <label className="flex items-center gap-2 mt-3 text-sm">
            <input type="checkbox" checked={smsConsent} onChange={e => setSmsConsent(e.target.checked)} />
            وافق العميل على استلام رسالة واحدة عند جاهزية السيارة.
          </label>
        )}
        <p className="txt-muted text-sm mt-2">الرقم لإشعار الجاهزية فقط. لن تُرسل رسالة فعلية قبل تفعيل مزود SMS.</p>
      </section>

      {!bulkMode && presets.length > 0 && (
        <section className="card">
          <h2 className="section-title">{tt("تسجيل سريع")}</h2>
          <PresetGrid presets={presets} disabled={submitting} onPick={handlePresetPick} lang={lang} />
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="section-title mb-0">{bulkMode ? tt("إضافة عدة سيارات دفعة وحدة") : tt("إدخال سيارة جديدة")}</h2>
          {ownerView && <button type="button" className="btn-secondary" onClick={() => setBulkMode((v) => !v)}>
            {bulkMode ? tt("رجوع لإدخال سيارة واحدة") : tt("➕ إضافة عدة سيارات")}
          </button>}
        </div>

        {!bulkMode ? (
          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">{tt("نوع السيارة")}</label>
                <div className="select-wrapper">
                  <select value={carType} onChange={(e) => setCarType(e.target.value)} required>
                    <option value="">{tt("اختر...")}</option>
                    {carTypes.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">{tt("نوع الخدمة")}</label>
                <div className="select-wrapper">
                  <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} required>
                    <option value="">{tt("اختر...")}</option>
                    {serviceTypes.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {priceSuggestions.length > 0 && (
              <div>
                <label className="form-label">{tt("الأسعار المعتادة لهذي التركيبة")}</label>
                <div className="suggestion-row">
                  {priceSuggestions.map((p) => (
                    <span key={p.id} className="contents">
                      <button
                        type="button"
                        className="suggestion-chip"
                        onClick={() => { setCashPaid(String(p.amount)); setCardPaid(""); }}
                      >
                        {formatCurrency(p.amount)} {tt("كاش")}
                      </button>
                      <button
                        type="button"
                        className="suggestion-chip"
                        onClick={() => { setCardPaid(String(p.amount)); setCashPaid(""); }}
                      >
                        {formatCurrency(p.amount)} {tt("بطاقة")}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">{tt("الكاش المحصل عند الوصول")}</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{tt("الشبكة المحصلة عند الوصول")}</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={cardPaid} onChange={(e) => setCardPaid(e.target.value)} />
              </div>
            </div>
            {ownerView && <div>
              <label className="form-label">{tt("المنفذ / الفريق")}</label>
              <select value={performer} onChange={(e) => setPerformer(e.target.value)}>
                <option value="">بدون تحديد</option>
                {performers.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>}
            <div>
              <label className="form-label">الخصم (ر.س) — الحد للعامل 10 ريالات</label>
              <input type="number" min="0" max={ownerView ? undefined : 10} step="0.01" inputMode="decimal" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} placeholder="0.00" />
              <p className="txt-muted text-sm mt-1">السعر قبل الخصم = الكاش + الشبكة + الخصم؛ ادخل المبلغ المحصل فعليًا.</p>
            </div>
            <div>
              <label className="form-label">{tt("ملاحظات")}</label>
              <input type="text" placeholder={tt("أي تفاصيل إضافية...")} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button type="submit" disabled={submitting} className="btn-add-car w-full">
              {submitting ? <span className="spinner" /> : tt("إضافة السيارة")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="space-y-4 mt-4">
            <label className="form-label">المنفذ لجميع الإدخالات</label>
            <select value={performer} onChange={e => setPerformer(e.target.value)}><option value="">بدون تحديد</option>{performers.map(name => <option key={name} value={name}>{name}</option>)}</select>
            <div className="space-y-3">
              {bulkRows.map((row, index) => (
                <div key={index} className="bulk-row">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                    <div>
                      <label className="form-label">{tt("نوع السيارة")}</label>
                      <select value={row.carType} onChange={(e) => updateBulkRow(index, { carType: e.target.value })} required>
                        <option value="">{tt("اختر...")}</option>
                        {carTypes.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">{tt("نوع الخدمة")}</label>
                      <select value={row.serviceType} onChange={(e) => updateBulkRow(index, { serviceType: e.target.value })} required>
                        <option value="">{tt("اختر...")}</option>
                        {serviceTypes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">{tt("كاش")}</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={row.cash} onChange={(e) => updateBulkRow(index, { cash: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">{tt("بطاقة")}</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={row.card} onChange={(e) => updateBulkRow(index, { card: e.target.value })} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="form-label">{tt("ملاحظات")}</label>
                        <input type="text" value={row.notes} onChange={(e) => updateBulkRow(index, { notes: e.target.value })} />
                      </div>
                      <button
                        type="button"
                        className="action-button delete-button"
                        onClick={() => removeBulkRow(index)}
                        disabled={bulkRows.length <= 1}
                        title={tt("حذف السطر")}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={addBulkRow}>{tt("+ إضافة سطر")}</button>
            </div>
            <button type="submit" disabled={bulkSubmitting} className="btn-add-car w-full">
              {bulkSubmitting ? <span className="spinner" /> : tt("حفظ الكل ({n})", { n: bulkRows.length })}
            </button>
          </form>
        )}
      </section>

      {!ownerView && (
        <section className="card space-y-3">
          <h2 className="section-title">وردية العامل الحالية</h2>
          <p className="txt-muted text-sm">
            {shiftStatus==="awaiting_owner"
              ? "الموازنة قيد اعتماد المالك، ولا يمكن بدء تسجيلات جديدة حتى تُفتح وردية جديدة."
              : shiftStatus==="open"
                ? "تستمر هذه النتائج حتى يعتمد المدير الموازنة. بعدها تُفتح وردية جديدة، ولا تُحذف السجلات."
                : "لا توجد وردية معتمدة للتسجيل على هذا الجهاز."}
          </p>
          {shiftError && <p role="alert" className="txt-warning text-sm">{shiftError}</p>}
          <p className="txt-muted text-sm">المزامنة المعلقة: {queueLength()} · حالة الجهاز: {deviceSeal==="sealed"?"مكتمل ومعتمد للمراجعة":"يستقبل التسجيلات"}</p>
          <button type="button" className="btn-secondary w-full" onClick={()=>void sealStaffDevice()}
            disabled={deviceSeal!=="unsealed"||shiftStatus!=="open"||queueLength()>0}>
            {deviceSeal==="sealing"?"جارٍ تأكيد الجهاز":deviceSeal==="sealed"?"تم تأكيد هذا الجهاز":"مزامنة وتأكيد انتهاء تسجيلات الجهاز"}
          </button>
        </section>
      )}

      <section className="card text-center">
        <button type="button" className="section-title text-center w-full underline decoration-dotted"
          onClick={() => {setDetailFilter("all");setShowTodayModal(true);}}>
          {ownerView ? "تسجيلات اليوم" : "تسجيلات الوردية الحالية"} · {dailyTotals.count} سيارة
        </button>
        {ownerView ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="السيارات" value={dailyTotals.count} tone="blue"
              onClick={()=>{setDetailFilter("all");setShowTodayModal(true);}} hint="اضغط لعرض السيارات" />
            <MetricCard label="كاش" value={formatCurrency(dailyTotals.cash)} tone="green"
              onClick={()=>{setDetailFilter("cash");setShowTodayModal(true);}} hint="عمليات الكاش" />
            <MetricCard label="الشبكة" value={formatCurrency(dailyTotals.card)} tone="purple"
              onClick={()=>{setDetailFilter("card");setShowTodayModal(true);}} hint="عمليات الشبكة" />
            <MetricCard label="المقبوض" value={formatCurrency(dailyTotals.total)} tone="slate"
              onClick={()=>{setDetailFilter("all");setShowTodayModal(true);}} hint="جميع العمليات وتفاصيلها" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="سيارات الوردية" value={workerSummary.cars} tone="blue"
              onClick={()=>{setDetailFilter("all");setShowTodayModal(true);}} hint="تفاصيل كل سيارة" />
            <MetricCard label="مجموع العشرات للفريق" value={formatCurrency(workerSummary.collectiveTens)} tone="emerald"
              onClick={()=>setShowCrewModal(true)} hint="10 ريالات لكل سيارة للفريق كاملًا" />
          </div>
        )}
        <p className="txt-muted text-sm mt-3">المستحق جماعي لجميع العمال؛ مكافأة ريالين القديمة مجمّدة. لا يحدد الحساب المشترك مستحق كل عامل منفردًا.</p>
        {ownerView && (
          <div className="mt-3">
            <MetricCard label="مخصص عمال الوردية المفتوحة" value={formatCurrency(crewProvision)} tone="emerald"
              onClick={()=>setShowCrewModal(true)} hint="تفاصيل السيارات ومخصص 10 ريالات عن كل واحدة" />
          </div>
        )}
      </section>

      {!ownerView && (
        <section className="card">
          <h2 className="section-title">إشعارات السيارات الجاهزة</h2>
          <p className="txt-muted text-sm">عند انتهاء الغسيل اضغط «السيارة جاهزة». عند انقطاع الإنترنت يُحفظ الطلب حتى المزامنة. إرسال SMS غير مفعّل في هذه النسخة التجريبية.</p>
          <div className="space-y-2 mt-3">
            {todayEntriesWithPending.filter(e=>Boolean(e.customer_phone)).slice(0,50).length === 0
              ? <p className="txt-muted text-sm">لا توجد سيارات برقم جوال اليوم.</p>
              : todayEntriesWithPending.filter(e=>Boolean(e.customer_phone)).slice(0,50).map(entry=>(
                <div key={entry.id} className="flex items-center justify-between gap-2 border-b pb-2">
                  <span className="text-sm">{entry.car_type} · {entry.service_type} · {new Date(entry.occurred_at).toLocaleTimeString(dateLocale,{hour:"2-digit",minute:"2-digit"})}</span>
                  {entry.ready_at
                    ? <span className="text-sm txt-cash">جاهزة</span>
                    : <button type="button" className="btn-secondary" disabled={readyBusy===entry.id} onClick={()=>void requestReady(entry)}>السيارة جاهزة</button>}
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="card overflow-hidden p-0" hidden={!ownerView}>
        <button type="button" className={`accordion-button ${showMonthly ? "active" : ""}`} onClick={() => setShowMonthly((v) => !v)}>
          <span>{tt("الدخل الشهري")}</span>
          <span>⌄</span>
        </button>
        <div className="accordion-content" style={{ maxHeight: showMonthly ? "5000px" : undefined }}>
          <div className="p-4 overflow-x-auto">
            {monthlyByDay.length === 0 ? (
              <p className="py-5 txt-muted text-center">{tt("لا توجد بيانات دخل لهذا الشهر.")}</p>
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>{tt("اليوم")}</th><th>{tt("عدد السيارات")}</th><th>{tt("كاش")}</th><th>{tt("بطاقة")}</th><th>{tt("الإجمالي")}</th></tr>
                </thead>
                <tbody>
                  {monthlyByDay.map((row) => {
                    const day = new Date(`${row.date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long" });
                    return (
                      <tr key={row.date}>
                        <td data-label={tt("اليوم")}>
                          <button type="button" className="link-inline" onClick={() => setSelectedDay(row.date)}>
                            {day} - {row.date}
                          </button>
                        </td>
                        <td data-label={tt("عدد السيارات")}>{row.cars}</td>
                        <td data-label={tt("كاش")} className="txt-cash">{formatCurrency(row.cash)}</td>
                        <td data-label={tt("بطاقة")} className="txt-card">{formatCurrency(row.card)}</td>
                        <td data-label={tt("الإجمالي")} className="font-extrabold">{formatCurrency(row.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {selectedDay && (
        <Modal title={tt("إدخالات {day}", { day: selectedDay })} onClose={() => setSelectedDay(null)}>
          <div className="overflow-x-auto" dir={lang === "en" ? "ltr" : "rtl"}>
            <table className="app-table">
              <thead>
                <tr><th>{tt("الوقت")}</th><th>{tt("السيارة")}</th><th>{tt("الخدمة")}</th><th>{tt("الدفع")}</th><th>{tt("كاش")}</th><th>{tt("بطاقة")}</th><th>{tt("الإجمالي")}</th><th>{tt("إجراءات")}</th></tr>
              </thead>
              <tbody>
                {dayEntries.length === 0 ? (
                  <tr><td colSpan={8} className="text-center txt-muted py-5">{tt("لا توجد إدخالات بهذا اليوم.")}</td></tr>
                ) : (
                  dayEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      carTypes={carTypes}
                      serviceTypes={serviceTypes}
                      editing={ownerView && editingId === entry.id}
                      editable={ownerView}
                      onEdit={() => setEditingId(entry.id)}
                      onCancel={() => setEditingId(null)}
                      onSave={(patch) => handleUpdate(entry, patch)}
                      onDelete={() => handleDelete(entry.id)}
                      lang={lang}
                      onDetails={() => setSelectedEntry(entry)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {showCrewModal && (
        <Modal title="تفاصيل مخصص عشرات العمال للوردية" onClose={()=>setShowCrewModal(false)}>
          <p className="txt-muted text-sm mb-3">الأساس: {ownerView?shiftCarCount:workerSummary.cars} سيارة × 10 ريالات = {formatCurrency(ownerView?crewProvision:workerSummary.collectiveTens)} لجميع العمال، وليس لكل عامل.</p>
          <div className="space-y-2">
            {todayEntriesWithPending.length===0
              ? <p className="txt-muted">لا توجد سيارات مسجلة في الوردية الحالية.</p>
              : todayEntriesWithPending.map((entry,index)=>(
                <button key={entry.id} type="button" className="w-full flex items-center justify-between text-start border-b py-3"
                  onClick={()=>setSelectedEntry(entry)}>
                  <span>#{index+1} · {entry.car_type} · {entry.service_type}
                    {entry.pending?" · بانتظار المزامنة":""}</span>
                  <strong>10 ر.س</strong>
                </button>
              ))}
          </div>
        </Modal>
      )}

      {selectedEntry && (
        <Modal title="تفاصيل عملية السيارة" onClose={()=>setSelectedEntry(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="txt-muted text-sm">نوع السيارة</p><strong>{selectedEntry.car_type}</strong></div>
              <div><p className="txt-muted text-sm">الخدمة</p><strong>{selectedEntry.service_type}</strong></div>
              <div><p className="txt-muted text-sm">تاريخ التسجيل</p><strong>{new Date(selectedEntry.occurred_at).toLocaleString(dateLocale,{timeZone:"Asia/Riyadh"})}</strong></div>
              <div><p className="txt-muted text-sm">حالة المزامنة</p><strong>{selectedEntry.pending?"بانتظار الرفع":"محفوظة على النظام"}</strong></div>
              <div><p className="txt-muted text-sm">كاش</p><strong>{formatCurrency(selectedEntry.cash_paid)}</strong></div>
              <div><p className="txt-muted text-sm">الشبكة</p><strong>{formatCurrency(selectedEntry.card_paid)}</strong></div>
              <div><p className="txt-muted text-sm">خصم</p><strong>{formatCurrency(selectedEntry.discount_amount||0)}</strong></div>
              <div><p className="txt-muted text-sm">المحصل فعليًا</p><strong>{formatCurrency(selectedEntry.gross)}</strong></div>
              <div><p className="txt-muted text-sm">مخصص العمال الجماعي</p><strong>10.00 ر.س</strong></div>
              <div><p className="txt-muted text-sm">رسالة الجاهزية</p><strong>{selectedEntry.ready_at?"الجاهزية مسجلة":"لم تسجل الجاهزية"}</strong></div>
            </div>
            {selectedEntry.notes && <div className="border-t pt-2"><p className="txt-muted text-sm">الملاحظات</p><p>{selectedEntry.notes}</p></div>}
          </div>
        </Modal>
      )}

      {showTodayModal && (
        <Modal title={ownerView ? "تفاصيل تسجيلات اليوم" : "تفاصيل الوردية الحالية"} onClose={() => setShowTodayModal(false)}>
          <div className="overflow-x-auto" dir={lang === "en" ? "ltr" : "rtl"}>
            <table className="app-table">
              <thead>
                <tr><th>{tt("الوقت")}</th><th>{tt("السيارة")}</th><th>{tt("الخدمة")}</th><th>{tt("الدفع")}</th><th>{tt("كاش")}</th><th>{tt("بطاقة")}</th><th>{tt("الإجمالي")}</th><th>{tt("إجراءات")}</th></tr>
              </thead>
              <tbody>
                {visibleDetailEntries.length === 0 ? (
                  <tr><td colSpan={8} className="text-center txt-muted py-5">لا توجد تسجيلات مطابقة.</td></tr>
                ) : (
                  visibleDetailEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      carTypes={carTypes}
                      serviceTypes={serviceTypes}
                      editing={ownerView && editingId === entry.id}
                      editable={ownerView}
                      onEdit={() => setEditingId(entry.id)}
                      onCancel={() => setEditingId(null)}
                      onSave={(patch) => handleUpdate(entry, patch)}
                      onDelete={() => handleDelete(entry.id)}
                      lang={lang}
                      onDetails={() => setSelectedEntry(entry)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
