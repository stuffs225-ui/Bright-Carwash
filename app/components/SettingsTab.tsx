"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/business";
import { showToast } from "@/lib/toast";
import { DEFAULT_SETTINGS, loadSettings, updateSetting, type AppSettings } from "@/lib/settings";
import { createPreset, deletePreset, loadPresets } from "@/lib/presets";
import { supabase } from "@/lib/supabaseClient";
import { addLookup, loadLookup, renameLookup, setLookupActive, type LookupRow, type LookupTable } from "@/lib/lookups";
import type { EntryPreset } from "@/lib/types";
import { applyTheme, getTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import { ImportSheetSection } from "./ImportSheetSection";

type Category = "operations" | "access" | "appearance" | "data" | "backup";

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: "operations", label: "التشغيل اليومي", icon: "📊" },
  { value: "access", label: "الوصول", icon: "🔐" },
  { value: "appearance", label: "المظهر", icon: "🎨" },
  { value: "data", label: "البيانات", icon: "🗂️" },
  { value: "backup", label: "النسخ الاحتياطي", icon: "🔒" },
];

export function SettingsTab() {
  const [category, setCategory] = useState<Category>("operations");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  const [threshold, setThreshold] = useState("");
  const [rate, setRate] = useState("");
  const [dailyTarget, setDailyTarget] = useState("");
  const [backupStatus,setBackupStatus]=useState<{lastSavedAt:string|null;lastSentAt:string|null;latestArchive:string|null;archivedFilesShown:number;offsiteConfigured:boolean;checksumAvailable:boolean;encryptionConfigured:boolean}|null>(null);
  const [backupError,setBackupError]=useState("");

  const [presets, setPresets] = useState<EntryPreset[]>([]);
  const [theme, setThemeState] = useState<ThemeChoice>("auto");

  const hydrate = useCallback((s: AppSettings) => {
    setSettings(s);
    setThreshold(String(s.shift_car_threshold));
    setRate(String(s.worker_bonus_rate));
    setDailyTarget(String(s.daily_expense_target));
  }, []);

  useEffect(() => {
    loadSettings().then(hydrate);
    loadPresets().then(setPresets);
    setThemeState(getTheme());
  }, [hydrate]);

  async function save(patch: Partial<AppSettings>) {
    setSaving(true);
    const next = { ...settings, ...patch };
    for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
      const result = await updateSetting(key, next[key]);
      if (result.error) { showToast("فشل حفظ الإعداد: " + result.error.message, "error"); setSaving(false); return; }
    }
    setSettings(next);
    setSaving(false);
    showToast("تم الحفظ.");
  }

  function chooseTheme(choice: ThemeChoice) {
    setThemeState(choice);
    setTheme(choice);
    applyTheme(choice);
  }

  useEffect(()=>{
    if(category!=="backup")return;
    let mounted=true;
    async function loadBackup(){
      try{
        const {data:{session}}=await supabase.auth.getSession();
        if(!session)throw Error("جلسة الإدارة غير متاحة");
        const response=await fetch("/api/backup/status",{
          headers:{authorization:"Bearer "+session.access_token},cache:"no-store"
        });
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw Error(json.error||"تعذر قراءة حالة النسخ");
        if(mounted){setBackupStatus(json);setBackupError("");}
      }catch(e){
        if(mounted)setBackupError(e instanceof Error?e.message:"تعذر تحميل حالة النسخ");
      }
    }
    void loadBackup();
    return()=>{mounted=false;};
  },[category]);

  return (
    <div className="space-y-6">
      <nav className="settings-tabs" role="tablist" aria-label="أقسام الإعدادات">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="tab"
            aria-selected={category === c.value}
            className={`settings-tab-button ${category === c.value ? "active" : ""}`}
            onClick={() => setCategory(c.value)}
          >
            <span className="settings-tab-icon">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </nav>

      {category === "operations" && (
        <div className="space-y-6">
          <Section title="مخصص العمال الجماعي" hint="10 ريالات إجمالًا لفريق العمال عن كل سيارة صغيرة أو كبيرة مسجلة، وليس لكل عامل على حدة.">
            <p className="txt-muted text-sm">مكافأة ريالين عن السيارات التي تتجاوز 15 سيارة مجمّدة مؤقتًا، ولن تُحتسب أو تُدفع آليًا. يمكن للمدير إضافة مكافأة منفصلة للوردية من سجل المكافآت.</p>
          </Section>

          <Section title="هدف التعادل اليومي" hint="عدد السيارات اللي تغطي مصروف اليوم. اتركه صفراً ليُحسب تلقائياً من آخر 90 يوم.">
            <Field label="مصروف اليوم المستهدف (0 = تلقائي)">
              <input type="number" min="0" step="0.01" value={dailyTarget} onChange={(e) => setDailyTarget(e.target.value)} />
            </Field>
            <SaveButton disabled={saving} onClick={() => save({ daily_expense_target: Number(dailyTarget) || 0 })} />
          </Section>
        </div>
      )}

      {category === "access" && (
        <div className="space-y-6">
          <Section title="رابط تسجيل العمال">
            <p className="txt-muted text-sm">العامل لا يحتاج أي حساب أو تسجيل دخول أو رقم PIN. يوجد رابط واحد مشترك لجميع العمال يُنشأ ويُلغى من قسم «الإدارة ← رابط العامل». لا ترسل رابط المدير للعمال.</p>
            <p className="text-sm mt-2">عند فقدان الرابط المشترك القديم، ألغِه من صفحة «رابط العامل» وأنشئ رابطًا جديدًا. لا تستخدم صفحة /worker لأنها صفحة إرشادية وليست رابطًا نشطًا.</p>
          </Section>
        </div>
      )}

      {category === "appearance" && (
        <div className="space-y-6">
          <Section title="المظهر">
            <div className="flex flex-wrap gap-2">
              {(["auto", "light", "dark"] as ThemeChoice[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={theme === c ? "btn-primary" : "btn-secondary"}
                  onClick={() => chooseTheme(c)}
                >
                  {c === "auto" ? "تلقائي" : c === "light" ? "فاتح" : "داكن"}
                </button>
              ))}
            </div>
          </Section>
        </div>
      )}

      {category === "data" && (
        <div className="space-y-6">
          <PresetsSection presets={presets} onChanged={() => loadPresets().then(setPresets)} />
          <CarwashAddonsSettings />
          <ImportSheetSection />
          <LookupSection table="car_types" title="أنواع السيارات" />
          <LookupSection table="service_types" title="أنواع الخدمات" />
          <LookupSection table="expense_types" title="أنواع المصروفات" />
        </div>
      )}

      {category === "backup" && (
        <div className="space-y-4">
          <Section title="حالة النسخ المشفر — تلقائي يوميًا">
            <p className="txt-muted text-sm">النسخ اليومي يعمل بجدولة Vercel الساعة 06:00 صباحًا بتوقيت الرياض، ويحفظ ملفًا مشفرًا داخل مساحة خاصة في Supabase. لا تعتمد هذه الصفحة على إعدادات البريد القديمة.</p>
            {backupError&&<p role="alert" className="txt-warning text-sm">{backupError}</p>}
            {!backupStatus&&!backupError&&<p className="txt-muted">جارٍ جلب آخر حالة...</p>}
            {backupStatus&&<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl p-3" style={{background:"var(--surface-3)"}}>
                <strong>آخر نسخة محفوظة</strong>
                <p className="txt-muted mt-1 text-sm">{backupStatus.lastSavedAt?new Date(backupStatus.lastSavedAt).toLocaleString("ar-SA-u-ca-gregory-nu-latn",{timeZone:"Asia/Riyadh"}):"لم تُسجَّل نسخة مكتملة بعد"}</p>
              </div>
              <div className="rounded-xl p-3" style={{background:"var(--surface-3)"}}>
                <strong>ملفات النسخ الموجودة</strong>
                <p className="txt-muted mt-1">{backupStatus.archivedFilesShown} ملف ضمن آخر 10 نتائج</p>
              </div>
              <div className="rounded-xl p-3" style={{background:"var(--surface-3)"}}>
                <strong>مفتاح التشفير</strong>
                <p className="txt-muted mt-1">{backupStatus.encryptionConfigured?"مهيّأ على الخادم":"غير مهيّأ"}</p>
              </div>
              <div className="rounded-xl p-3" style={{background:"var(--surface-3)"}}>
                <strong>نسخة خارجية بالبريد</strong>
                <p className="txt-muted mt-1">{backupStatus.lastSentAt?"آخر إرسال: "+new Date(backupStatus.lastSentAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn"):"غير مفعلة أو لم يتم إرسالها"}</p>
              </div>
            </div>}
            <p className="txt-warning text-xs mt-3">النسخة داخل Supabase ليست بديلاً عن نسخة مستقلة خارج الخدمة، ولا يُعد التحقق من وجود الملف تجربة استعادة كاملة.</p>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="section-title mb-1">{title}</h2>
      {hint && <p className="txt-muted text-sm mb-4">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function SaveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn-primary mt-4" onClick={onClick} disabled={disabled}>
      حفظ
    </button>
  );
}

function PresetsSection({ presets, onChanged }: { presets: EntryPreset[]; onChanged: () => void }) {
  const [carType, setCarType] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [amount, setAmount] = useState("");

  async function add() {
    if (!carType.trim() || !serviceType.trim() || Number(amount) <= 0) {
      showToast("عبّي نوع السيارة والخدمة ومبلغاً أكبر من صفر.", "warning");
      return;
    }
    await createPreset({
      car_type: carType.trim(),
      service_type: serviceType.trim(),
      amount: Number(amount),
      sort_order: presets.length + 1,
    });
    setCarType(""); setServiceType(""); setAmount("");
    showToast("تمت إضافة الزر.");
    onChanged();
  }

  async function remove(id: string) {
    if (!confirm("حذف هذا الزر السريع؟")) return;
    await deletePreset(id);
    showToast("تم الحذف.");
    onChanged();
  }

  return (
    <Section title="أزرار التسجيل السريع" hint="الأزرار اللي تظهر فوق نموذج الإدخال — ضغطة واحدة تسجّل العملية.">
      <div className="overflow-x-auto mb-4">
        <table className="app-table">
          <thead>
            <tr><th>السيارة</th><th>الخدمة</th><th>السعر</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            {presets.length === 0 ? (
              <tr><td colSpan={4} className="text-center txt-muted py-5">لا توجد أزرار.</td></tr>
            ) : (
              presets.map((p) => (
                <tr key={p.id}>
                  <td data-label="السيارة">{p.car_type}</td>
                  <td data-label="الخدمة">{p.service_type}</td>
                  <td data-label="السعر">{formatCurrency(p.amount)}</td>
                  <td className="flex gap-1.5">
                    <button type="button" className="action-button delete-button" onClick={() => remove(p.id)}>حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="نوع السيارة"><input type="text" value={carType} onChange={(e) => setCarType(e.target.value)} /></Field>
        <Field label="نوع الخدمة"><input type="text" value={serviceType} onChange={(e) => setServiceType(e.target.value)} /></Field>
        <Field label="السعر"><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <button type="button" className="btn-primary mt-4" onClick={add}>إضافة زر</button>
    </Section>
  );
}

function LookupSection({ table, title }: { table: LookupTable; title: string }) {
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [newName, setNewName] = useState("");

  const reload = useCallback(() => { loadLookup(table).then(setRows); }, [table]);
  useEffect(reload, [reload]);

  async function add() {
    if (!newName.trim()) return;
    await addLookup(table, newName, rows.length + 1);
    setNewName("");
    showToast("تمت الإضافة.");
    reload();
  }

  async function toggle(row: LookupRow) {
    await setLookupActive(table, row.id, !row.active);
    reload();
  }

  async function rename(row: LookupRow) {
    const name = prompt("الاسم الجديد:", row.name);
    if (!name || name.trim() === row.name) return;
    await renameLookup(table, row.id, name);
    showToast("تم التعديل. ملاحظة: السجلات القديمة تحتفظ بالاسم السابق.", "warning");
    reload();
  }

  return (
    <Section title={title} hint="التعطيل يخفي الخيار من نماذج الإدخال بدون المساس بالسجلات القديمة.">
      <div className="overflow-x-auto">
        <table className="app-table">
          <thead>
            <tr><th>الاسم</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="text-center txt-muted py-5">لا توجد عناصر.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="الاسم">{r.name}</td>
                  <td data-label="الحالة" className={r.active ? "txt-cash" : "txt-muted"}>
                    {r.active ? "مفعّل" : "معطّل"}
                  </td>
                  <td className="flex gap-1.5">
                    <button type="button" className="action-button edit-button" onClick={() => rename(r)}>تعديل</button>
                    <button type="button" className="action-button delete-button" onClick={() => toggle(r)}>
                      {r.active ? "تعطيل" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 items-end mt-4">
        <div className="flex-1" style={{ minWidth: 200 }}>
          <Field label="إضافة عنصر جديد">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
        </div>
        <button type="button" className="btn-primary" onClick={add}>إضافة</button>
      </div>
    </Section>
  );
}


// Add-ons are a fixed approved price catalog. Worker clients can read active
// items only. Audited owner changes do not rewrite historical cash receipts.
function CarwashAddonsSettings(){
  type AddonRow={id:string;name:string;price:number;active:boolean};
  const [rows,setRows]=useState<AddonRow[]>([]);
  const [name,setName]=useState("");
  const [price,setPrice]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    const {data,error}=await supabase.from("carwash_addons")
      .select("id,name,price,active").order("name");
    if(error){showToast("تعذر قراءة الإضافات: "+error.message,"error");return;}
    setRows((data||[]) as AddonRow[]);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function add(){
    const amount=Number(price);
    if(!name.trim()||!Number.isFinite(amount)||amount<0||Math.round(amount*100)!==amount*100){
      showToast("اكتب اسم الإضافة وسعرًا صحيحًا.","warning");return;
    }
    setBusy(true);
    const {error}=await supabase.from("carwash_addons").insert({name:name.trim(),price:amount,active:true});
    setBusy(false);
    if(error){showToast(error.message,"error");return;}
    setName("");setPrice("");void refresh();
    showToast("تمت إضافة خدمة إضافية معتمدة.");
  }
  async function toggle(item:AddonRow){
    if(!confirm((item.active?"تعطيل":"تفعيل")+" الإضافة؟"))return;
    const {error}=await supabase.from("carwash_addons").update({active:!item.active}).eq("id",item.id);
    if(error){showToast(error.message,"error");return;}
    void refresh();
  }
  async function reprice(item:AddonRow){
    const input=prompt("السعر الجديد (ر.س):",String(item.price));
    if(input===null)return;
    const value=Number(input);
    if(!Number.isFinite(value)||value<0||Math.abs(Math.round(value*100)-value*100)>0.00001){
      showToast("السعر الجديد غير صالح.","warning");return;
    }
    const {error}=await supabase.from("carwash_addons").update({price:value}).eq("id",item.id);
    if(error){showToast(error.message,"error");return;}
    showToast("تغير سعر الإضافة للتسجيلات الجديدة فقط؛ السجلات التاريخية محفوظة.");void refresh();
  }
  return <Section title="الخدمات الإضافية وأسعارها" hint="خدمات اختيارية تُضاف إلى أسعار الغسيل الثابتة. الأسعار المعتمدة فقط تظهر للعامل.">
    <div className="space-y-3">
      {rows.map(item=><div key={item.id} className="flex flex-wrap justify-between items-center gap-2 border-b py-3">
        <span className="font-semibold">{item.name} · {formatCurrency(item.price)} · {item.active?"مفعّلة":"موقفة"}</span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={()=>void reprice(item)}>تعديل السعر</button>
          <button type="button" className="btn-secondary" onClick={()=>void toggle(item)}>{item.active?"تعطيل":"تفعيل"}</button>
        </div>
      </div>)}
      <label className="form-label">اسم الإضافة<input type="text" value={name} onChange={e=>setName(e.target.value)} /></label>
      <label className="form-label">سعر الإضافة (ر.س)<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} /></label>
      <button className="btn-primary" type="button" disabled={busy} onClick={()=>void add()}>إضافة خدمة إضافية</button>
    </div>
  </Section>;
}
