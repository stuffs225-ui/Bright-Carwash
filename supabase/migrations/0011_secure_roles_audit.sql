-- Carwash V2 security hardening. Apply only to the NEW isolated Supabase project.
-- Prerequisite: migrations 0001-0010. Run via reviewed migrations.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.app_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','manager','worker')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.app_members enable row level security;

create or replace function private.current_app_role()
returns text language sql stable security definer
set search_path = ''
as $$
 select role from public.app_members
 where user_id = (select auth.uid()) and active = true limit 1
$$;
revoke all on function private.current_app_role() from public;
grant execute on function private.current_app_role() to authenticated;

alter table public.entries add column if not exists created_by uuid references auth.users(id);
alter table public.entries alter column created_by set default auth.uid();
alter table public.expenses add column if not exists created_by uuid references auth.users(id);
alter table public.expenses alter column created_by set default auth.uid();
alter table public.entries add column if not exists legacy_ref text;
alter table public.expenses add column if not exists legacy_ref text;
create unique index if not exists entries_legacy_ref_unique on public.entries (legacy_ref) where legacy_ref is not null;
create unique index if not exists expenses_legacy_ref_unique on public.expenses (legacy_ref) where legacy_ref is not null;

-- Remove all earlier permissive policies before building the intended role rules.
do $$
declare r record;
begin
 for r in
  select schemaname, tablename, policyname from pg_policies
  where schemaname = 'public'
    and tablename = any(array[
      'app_members','car_types','service_types','expense_types',
      'entry_presets','settings','entries','expenses','workers','worker_ledger'
    ])
 loop
  execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
 end loop;
end $$;

create policy member_self_read on public.app_members
for select to authenticated using (user_id = (select auth.uid()) or private.current_app_role() = 'owner');
create policy owner_add_members on public.app_members
for insert to authenticated with check (private.current_app_role() = 'owner');
create policy owner_update_members on public.app_members
for update to authenticated using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');
create policy owner_delete_members on public.app_members
for delete to authenticated using (private.current_app_role() = 'owner');

do $$
declare t text;
begin
 foreach t in array array['car_types','service_types','expense_types','entry_presets','workers']
 loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy staff_read_%I on public.%I for select to authenticated using (private.current_app_role() in (''owner'',''manager'',''worker''))',t,t);
  execute format('create policy lead_insert_%I on public.%I for insert to authenticated with check (private.current_app_role() in (''owner'',''manager''))',t,t);
  execute format('create policy lead_update_%I on public.%I for update to authenticated using (private.current_app_role() in (''owner'',''manager'')) with check (private.current_app_role() in (''owner'',''manager''))',t,t);
  execute format('create policy owner_delete_%I on public.%I for delete to authenticated using (private.current_app_role() = ''owner'')',t,t);
 end loop;
end $$;

alter table public.settings enable row level security;
create policy scoped_settings_read on public.settings for select to authenticated
using (
 private.current_app_role() = 'owner'
 or (
  private.current_app_role() in ('manager','worker')
  and key in ('shift_car_threshold','worker_bonus_rate','daily_expense_target','shift_start_hour','shift_end_hour')
 )
);
create policy owner_update_settings on public.settings
for update to authenticated using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');
create policy owner_insert_settings on public.settings
for insert to authenticated with check (private.current_app_role() = 'owner');

alter table public.entries enable row level security;
create policy staff_read_entries on public.entries for select to authenticated
using (private.current_app_role() in ('owner','manager','worker'));
create policy staff_insert_entries on public.entries for insert to authenticated
with check (private.current_app_role() in ('owner','manager','worker') and created_by = (select auth.uid()));
create policy lead_update_entries on public.entries for update to authenticated
using (private.current_app_role() in ('owner','manager'))
with check (private.current_app_role() in ('owner','manager'));

alter table public.expenses enable row level security;
create policy lead_read_expenses on public.expenses for select to authenticated
using (private.current_app_role() in ('owner','manager'));
create policy lead_insert_expenses on public.expenses for insert to authenticated
with check (private.current_app_role() in ('owner','manager') and created_by = (select auth.uid()));
create policy lead_update_expenses on public.expenses for update to authenticated
using (private.current_app_role() in ('owner','manager'))
with check (private.current_app_role() in ('owner','manager'));

alter table public.worker_ledger enable row level security;
create policy lead_read_ledger on public.worker_ledger for select to authenticated
using (private.current_app_role() in ('owner','manager'));
create policy lead_insert_ledger on public.worker_ledger for insert to authenticated
with check (private.current_app_role() in ('owner','manager'));
create policy lead_update_ledger on public.worker_ledger for update to authenticated
using (private.current_app_role() in ('owner','manager'))
with check (private.current_app_role() in ('owner','manager'));

-- Audit financial edits: append-only for app users, owner-only read.
create table if not exists public.audit_events (
 id bigint generated always as identity primary key,
 table_name text not null,
 row_id text,
 action text not null,
 actor_id uuid,
 occurred_at timestamptz not null default now(),
 before_row jsonb,
 after_row jsonb
);
alter table public.audit_events enable row level security;
create policy owner_read_audit on public.audit_events for select to authenticated
using (private.current_app_role() = 'owner');

create or replace function private.audit_row()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
 insert into public.audit_events(table_name,row_id,action,actor_id,before_row,after_row)
 values(TG_TABLE_NAME,
   coalesce(case when TG_OP='DELETE' then old.id::text else new.id::text end,''),
   TG_OP, auth.uid(),
   case when TG_OP='INSERT' then null else to_jsonb(old) end,
   case when TG_OP='DELETE' then null else to_jsonb(new) end);
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function private.audit_row() from public;
do $$
declare t text;
begin
 foreach t in array array['entries','expenses','worker_ledger']
 loop
  execute format('drop trigger if exists audit_change on public.%I',t);
  execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_row()',t);
 end loop;
end $$;
-- PIN is no longer an authorization factor or readable config.
delete from public.settings where key = 'owner_pin';
commit;