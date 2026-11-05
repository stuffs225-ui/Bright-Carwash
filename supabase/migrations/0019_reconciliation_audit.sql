-- Document every owner decision during reconciliation; preserve original source rows.
drop trigger if exists audit_change on public.legacy_import_issues;
create trigger audit_change
after insert or update or delete on public.legacy_import_issues
for each row execute function private.audit_row();

-- Revoke direct table DELETE/INSERT for user roles even if another grant is later introduced.
revoke insert, delete on public.legacy_import_issues from anon,authenticated;
revoke insert, update, delete on public.legacy_source_rows from anon,authenticated;

-- Require owner explanations even for direct API calls.
alter table public.legacy_import_issues
add constraint reconciled_requires_reason
check (
 status = 'pending' or
 (length(trim(coalesce(resolution_note,''))) >= 10
  and resolved_at is not null and resolved_by is not null)
);
grant select on public.legacy_import_issues to authenticated;
grant update(status,resolution_note,resolved_at,resolved_by)
 on public.legacy_import_issues to authenticated;
grant select on public.legacy_source_rows to authenticated;

-- Mobile manager may enter an expense for a past accounting month. The
-- effective occurred_at date can differ from the actual input and upload time.
-- created_at remains the server-side insertion time; this is the capture time
-- on the device, used to review delayed uploads and offline reconciliation.
alter table public.expenses
  add column if not exists client_recorded_at timestamptz;
comment on column public.expenses.client_recorded_at is
  'Client capture timestamp; created_at remains the authoritative server receipt timestamp.';


-- ===============================================================
-- OWNER-APPROVED CARWASH V2 OPERATIONS, NOV 05 2026.
-- This migration is only for a NEW, SEPARATE carwash development DB.
-- ===============================================================

-- Workers share ONE authorized phone account; no individual worker identity.
-- Server row policies must prevent that account from reading owner/manager rows.
drop policy if exists staff_read_entries on public.entries;
create policy shared_staff_account_entries on public.entries
 for select to authenticated
 using (
  private.current_app_role() in ('owner','manager')
  or (
   private.current_app_role() = 'worker'
   and created_by = (select auth.uid())
  )
 );
create index if not exists entries_created_by_occurred_at
 on public.entries(created_by, occurred_at desc);

-- The amount collected on arrival is cash_paid + card_paid (NET of discount).
-- list_price is generated and the pre-discount price can be reconstructed.
alter table public.entries
 add column if not exists discount_amount numeric(10,2) not null default 0
  check (discount_amount >= 0),
 add column if not exists customer_phone text
  check (customer_phone is null or customer_phone ~ '^\+9665[0-9]{8}$'),
 add column if not exists sms_consent boolean not null default false,
 add column if not exists ready_at timestamptz;
alter table public.entries
 add column if not exists list_price numeric(10,2)
 generated always as (cash_paid + card_paid + discount_amount) stored;

-- The limit must be enforced even when an offline device replays an entry.
drop policy if exists staff_insert_entries on public.entries;
create policy staff_insert_carwash_with_discount_limit on public.entries
 for insert to authenticated
 with check (
  private.current_app_role() in ('owner','manager','worker')
  and created_by = (select auth.uid())
  and (
   private.current_app_role() in ('owner','manager')
   or discount_amount <= 10
  )
 );

-- Only the authenticated server-side RPC can mark a car ready and queue SMS.
-- There is NO SMS sending provider wired in this migration.
create table if not exists public.ready_sms_outbox (
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null unique references public.entries(id) on delete restrict,
 destination_phone text not null check(destination_phone ~ '^\+9665[0-9]{8}$'),
 status text not null default 'pending_provider'
  check(status in ('pending_provider','queued','sent','failed')),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 provider_message_id text,
 last_error text
);
alter table public.ready_sms_outbox enable row level security;
create policy management_read_ready_sms on public.ready_sms_outbox
 for select to authenticated
 using(private.current_app_role() in ('owner','manager'));
-- NO anonymous or worker direct writes to the notification outbox.
revoke all on public.ready_sms_outbox from anon,authenticated;
grant select on public.ready_sms_outbox to authenticated;

create or replace function public.request_ready_notice(
 p_entry_id uuid default null,
 p_client_mutation_id text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
 v_role text;
 v_entry public.entries%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 v_role := private.current_app_role();
 if v_role not in ('owner','manager','worker') or v_role is null
 then raise exception 'Carwash membership required'; end if;
 if p_entry_id is null and p_client_mutation_id is null
 then raise exception 'Entry identifier required'; end if;

 select * into v_entry from public.entries
 where deleted_at is null
   and (id = p_entry_id or (
     p_client_mutation_id is not null and client_mutation_id = p_client_mutation_id
   ))
 for update;
 if not found then raise exception 'Synced entry not found'; end if;
 if v_role = 'worker' and v_entry.created_by is distinct from (select auth.uid())
 then raise exception 'Shared staff account cannot act on other accounts'; end if;

 if v_entry.ready_at is not null then
   return 'already_ready';
 end if;
 update public.entries set ready_at = now() where id = v_entry.id;
 if v_entry.customer_phone is null or not v_entry.sms_consent then
   return 'ready_no_sms';
 end if;
 insert into public.ready_sms_outbox(entry_id,destination_phone,created_by)
 values(v_entry.id,v_entry.customer_phone,(select auth.uid()))
 on conflict(entry_id) do nothing;
 return 'pending_provider';
end $$;
revoke all on function public.request_ready_notice(uuid,text) from public, anon;
grant execute on function public.request_ready_notice(uuid,text) to authenticated;

-- Manager crew-wide discretionary bonus: an accrual, NOT an expense payment.
create table if not exists public.crew_shift_bonuses (
 id uuid primary key default gen_random_uuid(),
 shift_date date not null,
 amount numeric(10,2) not null check(amount > 0),
 reason text not null check(length(trim(reason)) >= 5),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 deleted_at timestamptz
);
alter table public.crew_shift_bonuses enable row level security;
create policy lead_read_crew_shift_bonuses on public.crew_shift_bonuses
 for select to authenticated using(private.current_app_role() in ('owner','manager'));
create policy lead_insert_crew_shift_bonuses on public.crew_shift_bonuses
 for insert to authenticated with check(
  private.current_app_role() in ('owner','manager')
  and created_by = (select auth.uid())
 );
create policy lead_update_crew_shift_bonuses on public.crew_shift_bonuses
 for update to authenticated using(private.current_app_role() in ('owner','manager'))
 with check(private.current_app_role() in ('owner','manager'));
grant select,insert,update on public.crew_shift_bonuses to authenticated;
create trigger audit_change after insert or update or delete on public.crew_shift_bonuses
 for each row execute function private.audit_row();

-- Accounting months: ONLY the owner can reopen an approved prior month.
-- Every approval writes a NEW immutable server-calculated snapshot.
create table if not exists public.accounting_months (
 id uuid primary key default gen_random_uuid(),
 period text not null unique check(period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 status text not null default 'open' check(status in ('open','approved','reopened')),
 version integer not null default 0 check(version >= 0),
 approved_at timestamptz,
 approved_by uuid references auth.users(id),
 reopened_at timestamptz,
 reopened_by uuid references auth.users(id),
 reopen_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (status <> 'reopened' or length(trim(coalesce(reopen_reason,''))) >= 10)
);
alter table public.accounting_months enable row level security;
create policy lead_read_accounting_months on public.accounting_months
 for select to authenticated using(private.current_app_role() in ('owner','manager'));
-- Changes are done via owner-only RPC; direct updates are intentionally denied.
revoke all on public.accounting_months from anon,authenticated;
grant select on public.accounting_months to authenticated;
create trigger audit_change after insert or update or delete on public.accounting_months
 for each row execute function private.audit_row();

create table if not exists public.accounting_month_report_versions (
 id uuid primary key default gen_random_uuid(),
 month_id uuid not null references public.accounting_months(id),
 version integer not null check(version >= 1),
 snapshot jsonb not null,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 unique(month_id,version)
);
alter table public.accounting_month_report_versions enable row level security;
create policy lead_read_month_versions on public.accounting_month_report_versions
 for select to authenticated using(private.current_app_role() in ('owner','manager'));
revoke all on public.accounting_month_report_versions from anon,authenticated;
grant select on public.accounting_month_report_versions to authenticated;

create or replace function private.prevent_edits_to_approved_month()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
 v_period text;
 v_old_period text;
 v_status text;
begin
 v_period := to_char(new.occurred_at at time zone 'Asia/Riyadh','YYYY-MM');
 -- SHARE lock serializes changes with an owner approval's FOR UPDATE lock.
 select status into v_status from public.accounting_months
 where period=v_period for share;
 if v_status='approved' then
  raise exception 'Accounting month % approved: owner must reopen before financial edits',v_period;
 end if;
 if TG_OP='UPDATE' then
  v_old_period := to_char(old.occurred_at at time zone 'Asia/Riyadh','YYYY-MM');
  if v_old_period is distinct from v_period then
   select status into v_status from public.accounting_months
   where period=v_old_period for share;
   if v_status='approved' then
    raise exception 'Original accounting month % is approved',v_old_period;
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.prevent_edits_to_approved_month() from public;

create trigger expenses_approved_month_guard
 before insert or update on public.expenses
 for each row execute function private.prevent_edits_to_approved_month();

-- Readiness itself is not financial, so an approved car may later be marked ready.
create trigger entries_approved_month_guard
 before insert or update of car_type,service_type,cash_paid,card_paid,
 discount_amount,occurred_at,deleted_at on public.entries
 for each row execute function private.prevent_edits_to_approved_month();

create or replace function private.prevent_bonus_edits_in_approved_month()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
 select status into v_status from public.accounting_months
 where period=to_char(new.shift_date,'YYYY-MM') for share;
 if v_status='approved' then
  raise exception 'Cannot add or change crew bonus in approved month';
 end if;
 if TG_OP='UPDATE' and old.shift_date is distinct from new.shift_date then
  select status into v_status from public.accounting_months
  where period=to_char(old.shift_date,'YYYY-MM') for share;
  if v_status='approved' then raise exception 'Previous crew bonus month approved'; end if;
 end if;
 return new;
end $$;
revoke all on function private.prevent_bonus_edits_in_approved_month() from public;
create trigger crew_bonus_approved_month_guard
 before insert or update on public.crew_shift_bonuses
 for each row execute function private.prevent_bonus_edits_in_approved_month();

create or replace function public.reopen_carwash_month(
 p_period text, p_reason text
)
returns public.accounting_months
language plpgsql security definer set search_path='' as $$
declare v public.accounting_months%rowtype;
begin
 if private.current_app_role() <> 'owner' or (select auth.uid()) is null
 then raise exception 'Owner required'; end if;
 if p_reason is null or length(trim(p_reason)) < 10
 then raise exception 'Reopen reason must be at least 10 characters'; end if;
 select * into v from public.accounting_months
 where period=p_period for update;
 if not found or v.status <> 'approved'
 then raise exception 'Only an approved accounting month may be reopened'; end if;
 update public.accounting_months
 set status='reopened',reopen_reason=trim(p_reason),
     reopened_at=now(),reopened_by=(select auth.uid()),updated_at=now()
 where id=v.id returning * into v;
 return v;
end $$;
revoke all on function public.reopen_carwash_month(text,text) from public,anon;
grant execute on function public.reopen_carwash_month(text,text) to authenticated;

create or replace function public.approve_carwash_month(p_period text)
returns public.accounting_months
language plpgsql security definer set search_path='' as $$
declare
 v public.accounting_months%rowtype;
 v_start timestamptz;
 v_end timestamptz;
 v_snapshot jsonb;
begin
 if private.current_app_role() <> 'owner' or (select auth.uid()) is null
 then raise exception 'Owner required'; end if;
 if p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
 then raise exception 'Invalid accounting month'; end if;
 v_start := ((p_period || '-01')::date::timestamp at time zone 'Asia/Riyadh');
 v_end := (((p_period || '-01')::date + interval '1 month')::timestamp at time zone 'Asia/Riyadh');
 -- Never approve an incomplete month.
 if v_end > now() then raise exception 'Month not yet complete'; end if;

 insert into public.accounting_months(period)
 values(p_period) on conflict(period) do nothing;
 select * into v from public.accounting_months where period=p_period for update;
 if v.status='approved' then raise exception 'Month already approved; owner must reopen first'; end if;

 select jsonb_build_object(
  'period',p_period,
  'cash',coalesce((select sum(cash_paid) from public.entries
    where occurred_at >=v_start and occurred_at <v_end and deleted_at is null),0),
  'card',coalesce((select sum(card_paid) from public.entries
    where occurred_at >=v_start and occurred_at <v_end and deleted_at is null),0),
  'discount',coalesce((select sum(discount_amount) from public.entries
    where occurred_at >=v_start and occurred_at <v_end and deleted_at is null),0),
  'cars', (select count(*) from public.entries
    where occurred_at >=v_start and occurred_at <v_end and deleted_at is null),
  'crew_provision',10 * (select count(*) from public.entries
    where occurred_at >=v_start and occurred_at <v_end and deleted_at is null),
  'crew_extra_bonuses',coalesce((select sum(amount) from public.crew_shift_bonuses
    where shift_date >= (p_period || '-01')::date
      and shift_date < ((p_period || '-01')::date + interval '1 month')::date
      and deleted_at is null),0),
  'expenses',coalesce((select sum(amount) from public.expenses
    where occurred_at >=v_start and occurred_at <v_end and deleted_at is null),0),
  'captured_at',now()
 ) into v_snapshot;

 update public.accounting_months
 set status='approved',version=v.version+1,
     approved_at=now(),approved_by=(select auth.uid()),updated_at=now()
 where id=v.id returning * into v;

 insert into public.accounting_month_report_versions(month_id,version,snapshot,approved_by)
 values(v.id,v.version,v_snapshot,(select auth.uid()));
 return v;
end $$;
revoke all on function public.approve_carwash_month(text) from public,anon;
grant execute on function public.approve_carwash_month(text) to authenticated;
