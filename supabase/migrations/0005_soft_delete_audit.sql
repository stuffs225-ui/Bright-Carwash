-- حذف ناعم (Soft Delete): بدل ما نمسح السجل نهائياً، نعلّمه محذوف بس نخليه
-- بقاعدة البيانات — يحمي من حذف بالغلط، ويخلي سجل التدقيق يشتغل صح.
alter table entries add column deleted_at timestamptz;
alter table expenses add column deleted_at timestamptz;

-- ============================================================
-- سجل التدقيق (Audit Log): يسجل تلقائياً كل إضافة/تعديل/حذف
-- ============================================================
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index audit_log_record_idx on audit_log (table_name, record_id);
create index audit_log_changed_at_idx on audit_log (changed_at desc);

create or replace function audit_trigger_fn()
returns trigger language plpgsql security definer as $$
begin
  insert into audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('UPDATE','INSERT') then to_jsonb(NEW) else null end
  );
  return coalesce(NEW, OLD);
end;
$$;

create trigger entries_audit after insert or update or delete on entries
  for each row execute function audit_trigger_fn();

create trigger expenses_audit after insert or update or delete on expenses
  for each row execute function audit_trigger_fn();

alter table audit_log enable row level security;
create policy "authenticated read audit_log" on audit_log for select to authenticated using (true);
