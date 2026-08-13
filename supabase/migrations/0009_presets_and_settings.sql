-- أزرار الإدخال السريع + إعدادات جديدة
-- مكتوب بصيغة آمنة لإعادة التشغيل

create table if not exists entry_presets (
  id uuid primary key default gen_random_uuid(),
  car_type text not null,
  service_type text not null,
  amount numeric(10,2) not null check (amount > 0),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists entry_presets_sort_idx on entry_presets (sort_order);

alter table entry_presets enable row level security;
drop policy if exists "public read/write entry_presets" on entry_presets;
create policy "public read/write entry_presets" on entry_presets
  for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table entry_presets;
exception when duplicate_object then null;
end $$;

-- البذرة من التوزيع الفعلي للبيانات المنقولة:
-- أعلى 4 تركيبات تغطي ~97% من 6437 عملية
insert into entry_presets (car_type, service_type, amount, sort_order)
select * from (values
  ('سيارة صغيرة', 'غسيل كامل',  25.00, 1),
  ('سيارة كبيرة', 'غسيل كامل',  30.00, 2),
  ('سيارة صغيرة', 'غسيل كامل',  20.00, 3),
  ('سيارة صغيرة', 'غسيل خارجي', 15.00, 4)
) as v(car_type, service_type, amount, sort_order)
where not exists (select 1 from entry_presets);

-- إعدادات جديدة (نقطة التعادل + وضع الواجهة)
insert into settings (key, value) values
  ('daily_expense_target', '0'),
  ('owner_pin', '""'),
  ('default_mode', '"worker"')
on conflict (key) do nothing;
