-- مغسلة سيارتك اللامعة: المخطط الأساسي لقاعدة البيانات
-- يعادل شيتات Main_Data / Expenses / Lists في نظام Google Apps Script القديم

create extension if not exists pgcrypto;

-- ============================================================
-- LOOKUP TABLES (كانت شيت Lists)
-- ============================================================
create table car_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table service_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table expense_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#94a3b8',
  active boolean not null default true,
  sort_order int not null default 0
);

-- ============================================================
-- SETTINGS (كانت قيم ثابتة بالكود: SHIFT_CAR_THRESHOLD, WORKER_BONUS_RATE)
-- ============================================================
create table settings (
  key text primary key,
  value jsonb not null
);

insert into settings (key, value) values
  ('shift_car_threshold', '15'),
  ('worker_bonus_rate', '2'),
  ('shift_start_hour', '15'),
  ('shift_end_hour', '4');

-- ============================================================
-- ENTRIES (كانت شيت Main_Data)
-- ============================================================
create table entries (
  id uuid primary key default gen_random_uuid(),
  car_type text not null,
  service_type text not null,
  cash_paid numeric(10,2) not null default 0 check (cash_paid >= 0),
  card_paid numeric(10,2) not null default 0 check (card_paid >= 0),
  gross numeric(10,2) generated always as (cash_paid + card_paid) stored,
  payment_method text generated always as (
    case
      when cash_paid > 0 and card_paid > 0 then 'مختلط'
      when cash_paid > 0 then 'كاش'
      when card_paid > 0 then 'بطاقة'
      else 'غير محدد'
    end
  ) stored,
  notes text,
  occurred_at timestamptz not null default now(),
  -- اسم العامل/الفريق من النظام القديم، محفوظ للسجلات التاريخية فقط
  -- (غير مستخدم كحقل حي بنماذج الإدخال الجديدة بناء على قرار المستخدم)
  worker_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gross_positive check (cash_paid + card_paid > 0)
);

create index entries_occurred_at_idx on entries (occurred_at desc);

-- ============================================================
-- EXPENSES (كانت شيت Expenses)
-- ============================================================
create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_type text not null,
  amount numeric(10,2) not null check (amount > 0),
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_occurred_at_idx on expenses (occurred_at desc);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger entries_set_updated_at before update on entries
  for each row execute function set_updated_at();

create trigger expenses_set_updated_at before update on expenses
  for each row execute function set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
--
-- تنبيه أمني: النظام القديم (Google Apps Script) كان بدون أي تسجيل
-- دخول، فأي حد عنده الرابط يقدر يعدل البيانات. عشان ما نوقف عمل
-- المغسلة اليوم، نفس الوضع مؤقتاً هنا (وصول مفتوح بمفتاح anon).
-- لازم يُستبدل بسياسات تعتمد على تسجيل دخول الموظفين (Supabase Auth)
-- قبل ما ننشر الرابط لأي جهة خارج فريق العمل.
-- ============================================================
alter table car_types enable row level security;
alter table service_types enable row level security;
alter table expense_types enable row level security;
alter table settings enable row level security;
alter table entries enable row level security;
alter table expenses enable row level security;

create policy "public read/write car_types" on car_types for all using (true) with check (true);
create policy "public read/write service_types" on service_types for all using (true) with check (true);
create policy "public read/write expense_types" on expense_types for all using (true) with check (true);
create policy "public read settings" on settings for select using (true);
create policy "public read/write entries" on entries for all using (true) with check (true);
create policy "public read/write expenses" on expenses for all using (true) with check (true);
