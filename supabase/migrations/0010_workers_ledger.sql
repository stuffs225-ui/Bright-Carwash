-- دفتر حساب العمال + تنظيف البيانات الموروثة
-- مكتوب بصيغة آمنة لإعادة التشغيل

create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists worker_ledger (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  kind text not null check (kind in ('earning', 'payment')),
  amount numeric(10,2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  payment_source text check (payment_source in ('cash', 'atm', 'network', 'other')),
  expense_id uuid references expenses(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists worker_ledger_worker_idx on worker_ledger (worker_id, occurred_at desc);
create index if not exists worker_ledger_expense_idx on worker_ledger (expense_id);

alter table workers enable row level security;
alter table worker_ledger enable row level security;
drop policy if exists "public read/write workers" on workers;
create policy "public read/write workers" on workers for all using (true) with check (true);
drop policy if exists "public read/write worker_ledger" on worker_ledger;
create policy "public read/write worker_ledger" on worker_ledger for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table workers;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table worker_ledger;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- تنظيف موروث: 3 أسماء عمال كانت مسجّلة كـ"أنواع مصروفات"
-- (حسين / محمد عمر / محمد سعيد) بـ 40 قيد و 2,392 ريال.
-- الخطوات: إنشاء العمال، ثم توليد قيود دفتر مرتبطة بالمصروف الأصلي،
-- ثم إعادة تصنيف المصروف إلى "راتب". لا يُحذف أي قيد.
-- ============================================================
insert into workers (name, sort_order)
select distinct trim(expense_type), 0
from expenses
where trim(expense_type) in ('حسين', 'محمد عمر', 'محمد سعيد')
on conflict (name) do nothing;

insert into worker_ledger (worker_id, kind, amount, occurred_at, payment_source, expense_id, notes)
select w.id, 'payment', e.amount, e.occurred_at, 'other', e.id,
       coalesce(e.notes, '') || ' (منقول تلقائياً من نوع مصروف باسم العامل)'
from expenses e
join workers w on w.name = trim(e.expense_type)
where trim(e.expense_type) in ('حسين', 'محمد عمر', 'محمد سعيد')
  and not exists (select 1 from worker_ledger l where l.expense_id = e.id);

update expenses
set expense_type = 'راتب'
where trim(expense_type) in ('حسين', 'محمد عمر', 'محمد سعيد');
