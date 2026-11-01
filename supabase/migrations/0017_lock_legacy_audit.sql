-- Earlier migration 0005 created a second financial audit table readable by ALL staff.
-- This migration closes that leakage and leaves the V2 append-only audit_events as authority.
alter table public.audit_log enable row level security;
drop policy if exists "authenticated read audit_log" on public.audit_log;
create policy owner_read_legacy_audit on public.audit_log
  for select to authenticated using (private.current_app_role() = 'owner');

drop trigger if exists entries_audit on public.entries;
drop trigger if exists expenses_audit on public.expenses;
drop function if exists public.audit_trigger_fn();

-- No imported hard-coded recipient can receive V2 financial backups until owner opts in.
update public.settings set value = '""'::jsonb
where key = 'backup_email' and value = '"Aburaykah@gmail.com"'::jsonb;
