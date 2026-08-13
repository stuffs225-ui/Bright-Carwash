-- دلو تخزين للنسخ الاحتياطية اليومية (يُنشأ برمجياً هنا؛ لو فشل السطر التالي
-- بخطأ صلاحيات، أنشئه يدوياً من Supabase Dashboard → Storage → New bucket
-- باسم "backups" وخليه Private)
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- ============================================================
-- سجل الأخطاء (Error Log): يلتقط أخطاء الواجهة تلقائياً
-- ============================================================
create table error_log (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  url text,
  user_agent text,
  context jsonb,
  occurred_at timestamptz not null default now()
);

create index error_log_occurred_at_idx on error_log (occurred_at desc);

alter table error_log enable row level security;
-- نسمح بتسجيل الخطأ حتى لو المستخدم ما سجل دخول (زي خطأ بصفحة تسجيل الدخول نفسها)
create policy "anyone can insert error_log" on error_log for insert with check (true);
create policy "authenticated read error_log" on error_log for select to authenticated using (true);
