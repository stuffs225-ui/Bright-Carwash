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


-- ===============================================================
-- CARWASH SHIFT SESSION LIFECYCLE (isolated carwash dev only)
-- A manager-approved settlement creates a fresh staff dashboard.
-- Financial rows remain immutable audit/history; nothing is deleted.
-- ===============================================================
create table if not exists public.carwash_shifts (
 id uuid primary key default gen_random_uuid(),
 opened_at timestamptz not null default now(),
 status text not null default 'open'
  check(status in ('open','awaiting_owner','approved')),
 approved_at timestamptz,
 approved_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.carwash_shifts enable row level security;
create unique index if not exists carwash_only_one_active_shift
 on public.carwash_shifts ((true)) where status in ('open','awaiting_owner');
create policy carwash_staff_read_active_shift on public.carwash_shifts
 for select to authenticated
 using(
  private.current_app_role() in ('owner','manager')
  or (private.current_app_role()='worker' and status in ('open','awaiting_owner'))
 );
grant select on public.carwash_shifts to authenticated;
create trigger audit_change after insert or update or delete on public.carwash_shifts
 for each row execute function private.audit_row();
insert into public.carwash_shifts(status) select 'open'
 where not exists (select 1 from public.carwash_shifts where status in ('open','awaiting_owner'));

create table if not exists public.carwash_shift_devices (
 id uuid primary key default gen_random_uuid(),
 shift_id uuid not null references public.carwash_shifts(id),
 device_id uuid not null,
 account_id uuid not null references auth.users(id),
 registered_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 sealed_at timestamptz,
 unique(shift_id,device_id)
);
alter table public.carwash_shift_devices enable row level security;
create policy shift_device_management_read on public.carwash_shift_devices
 for select to authenticated using(
  private.current_app_role() in ('owner','manager')
  or (private.current_app_role()='worker' and account_id=(select auth.uid()))
 );
grant select on public.carwash_shift_devices to authenticated;
create trigger audit_change after insert or update or delete on public.carwash_shift_devices
 for each row execute function private.audit_row();

alter table public.entries
 add column if not exists shift_id uuid references public.carwash_shifts(id),
 add column if not exists device_id uuid;
create index if not exists carwash_entries_shift_idx
 on public.entries(shift_id,occurred_at desc);

create or replace function private.assign_carwash_shift()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_shift uuid; v_role text;
begin
 -- Historical source reconciliation remains separate from live shift totals.
 if new.legacy_ref is not null then return new; end if;
 v_role := private.current_app_role();
 if v_role is null then raise exception 'Authorized carwash membership required'; end if;
 select id into v_shift from public.carwash_shifts where status='open' for share;
 if v_shift is null then raise exception 'No open shift. Manager/owner approval is pending'; end if;
 if new.shift_id is not null and new.shift_id <> v_shift
 then raise exception 'The original offline shift is now closed; do not silently reassign a queued entry'; end if;
 new.shift_id:=v_shift;
 if v_role='worker' then
  if new.device_id is null then raise exception 'Register the staff device before recording a car'; end if;
  if not exists(
   select 1 from public.carwash_shift_devices d
   where d.shift_id=v_shift and d.device_id=new.device_id
    and d.account_id=(select auth.uid())
  ) then raise exception 'Unregistered staff device for this shift'; end if;
  update public.carwash_shift_devices set sealed_at=null,last_seen_at=now()
   where shift_id=v_shift and device_id=new.device_id;
 end if;
 return new;
end $$;
revoke all on function private.assign_carwash_shift() from public;
create trigger carwash_attach_shift_before_entry
 before insert on public.entries for each row execute function private.assign_carwash_shift();

-- Binding a shift session on each new entry is not optional: offline replays
-- must never drift into the next shift.
create or replace function public.register_carwash_device(p_device_id uuid,p_shift_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_shift uuid;
begin
 if private.current_app_role()<>'worker' or (select auth.uid()) is null
 then raise exception 'Worker account required'; end if;
 if p_device_id is null or p_shift_id is null then raise exception 'Device and shift required'; end if;
 select id into v_shift from public.carwash_shifts
  where id=p_shift_id and status='open' for share;
 if v_shift is null then raise exception 'Shift not open'; end if;
 insert into public.carwash_shift_devices(shift_id,device_id,account_id)
 values(v_shift,p_device_id,(select auth.uid()))
 on conflict(shift_id,device_id) do update
  set last_seen_at=now(),sealed_at=null
  where public.carwash_shift_devices.account_id=(select auth.uid());
 return v_shift;
end $$;
revoke all on function public.register_carwash_device(uuid,uuid) from public,anon;
grant execute on function public.register_carwash_device(uuid,uuid) to authenticated;

create or replace function public.seal_carwash_device(p_device_id uuid,p_shift_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_shift uuid;
begin
 if private.current_app_role()<>'worker' or (select auth.uid()) is null
 then raise exception 'Worker account required'; end if;
 select id into v_shift from public.carwash_shifts
 where id=p_shift_id and status='open' for share;
 if v_shift is null then raise exception 'No open shift to seal'; end if;
 update public.carwash_shift_devices
 set sealed_at=now(),last_seen_at=now()
 where shift_id=v_shift and device_id=p_device_id
 and account_id=(select auth.uid());
 if not found then raise exception 'Device is not registered'; end if;
 return true;
end $$;
revoke all on function public.seal_carwash_device(uuid,uuid) from public,anon;
grant execute on function public.seal_carwash_device(uuid,uuid) to authenticated;

-- Sensitive POS statement and physical cash totals are manager/owner-only.
create table if not exists public.carwash_shift_settlements (
 id uuid primary key default gen_random_uuid(),
 shift_id uuid not null unique references public.carwash_shifts(id),
 recorded_cash numeric(12,2) not null check(recorded_cash>=0),
 recorded_card numeric(12,2) not null check(recorded_card>=0),
 actual_cash numeric(12,2) not null check(actual_cash>=0),
 terminal_card numeric(12,2) not null check(terminal_card>=0),
 cash_difference numeric(12,2) not null,
 card_difference numeric(12,2) not null,
 cars integer not null check(cars>=0),
 crew_provision numeric(12,2) not null check(crew_provision>=0),
 report_object_path text not null check(length(trim(report_object_path))>0),
 difference_reason text,
 manager_id uuid not null references auth.users(id),
 manager_reviewed_at timestamptz not null default now(),
 variance_approved_by uuid references auth.users(id),
 variance_approved_at timestamptz,
 constraint difference_reason_if_needed check(
  (cash_difference=0 and card_difference=0)
  or length(trim(coalesce(difference_reason,'')))>=5
 )
);
alter table public.carwash_shift_settlements enable row level security;
create policy manager_read_shift_settlements on public.carwash_shift_settlements
 for select to authenticated using(private.current_app_role() in ('owner','manager'));
grant select on public.carwash_shift_settlements to authenticated;
create trigger audit_change after insert or update or delete on public.carwash_shift_settlements
 for each row execute function private.audit_row();

-- Private photo evidence bucket (server must confirm object existence).
insert into storage.buckets(id,name,public)
 values('carwash-pos-evidence','carwash-pos-evidence',false)
 on conflict(id) do nothing;
create policy carwash_pos_storage_read on storage.objects
 for select to authenticated using(
  bucket_id='carwash-pos-evidence'
  and private.current_app_role() in ('manager','owner')
 );
create policy carwash_pos_storage_insert on storage.objects
 for insert to authenticated with check(
  bucket_id='carwash-pos-evidence'
  and private.current_app_role() in ('manager','owner')
 );
create policy carwash_pos_storage_update on storage.objects
 for update to authenticated using(
  bucket_id='carwash-pos-evidence'
  and private.current_app_role() in ('manager','owner')
 ) with check(
  bucket_id='carwash-pos-evidence'
  and private.current_app_role() in ('manager','owner')
 );

create or replace function public.submit_carwash_shift_settlement(
 p_shift_id uuid,p_actual_cash numeric,p_terminal_card numeric,
 p_report_path text,p_reason text default null
)
returns text language plpgsql security definer set search_path='' as $$
declare
 v_shift public.carwash_shifts%rowtype;
 v_cash numeric; v_card numeric; v_count integer;
 v_cash_diff numeric; v_card_diff numeric; v_device_count integer;
begin
 if private.current_app_role() not in ('owner','manager') or (select auth.uid()) is null
 then raise exception 'Carwash manager account required'; end if;
 if p_actual_cash is null or p_terminal_card is null
 or p_actual_cash < 0 or p_terminal_card < 0 then
  raise exception 'Physical cash and POS total must be nonnegative'; end if;
 select * into v_shift from public.carwash_shifts
  where id=p_shift_id for update;
 if not found or v_shift.status<>'open' then raise exception 'Shift not open'; end if;

 select count(*) into v_device_count from public.carwash_shift_devices
  where shift_id=p_shift_id;
 if v_device_count=0 or exists(
  select 1 from public.carwash_shift_devices
  where shift_id=p_shift_id and sealed_at is null
 ) then raise exception 'Every registered staff device must synchronize and seal before close'; end if;

 if p_report_path is null
 or p_report_path not like p_shift_id::text||'/%'
 or not exists(
  select 1 from storage.objects where bucket_id='carwash-pos-evidence'
    and name=p_report_path
 ) then raise exception 'Verified POS statement attachment required'; end if;

 select coalesce(sum(cash_paid),0),coalesce(sum(card_paid),0),count(*)::integer
  into v_cash,v_card,v_count from public.entries
  where shift_id=p_shift_id and deleted_at is null;
 v_cash_diff:=p_actual_cash-v_cash;
 v_card_diff:=p_terminal_card-v_card;
 if (v_cash_diff<>0 or v_card_diff<>0)
 and length(trim(coalesce(p_reason,'')))<5 then
  raise exception 'Write a reason for each imbalance before sending to owner'; end if;

 insert into public.carwash_shift_settlements(
  shift_id,recorded_cash,recorded_card,actual_cash,terminal_card,
  cash_difference,card_difference,cars,crew_provision,
  report_object_path,difference_reason,manager_id
 ) values(
  p_shift_id,v_cash,v_card,p_actual_cash,p_terminal_card,
  v_cash_diff,v_card_diff,v_count,v_count*10,
  p_report_path,nullif(trim(coalesce(p_reason,'')),''),(select auth.uid())
 );

 if v_cash_diff<>0 or v_card_diff<>0 then
  update public.carwash_shifts set status='awaiting_owner' where id=p_shift_id;
  return 'awaiting_owner';
 end if;

 update public.carwash_shifts set status='approved',
  approved_at=now(),approved_by=(select auth.uid()) where id=p_shift_id;
 insert into public.carwash_shifts(status) values('open');
 return 'approved';
end $$;
revoke all on function public.submit_carwash_shift_settlement(uuid,numeric,numeric,text,text) from public,anon;
grant execute on function public.submit_carwash_shift_settlement(uuid,numeric,numeric,text,text) to authenticated;

create or replace function public.approve_carwash_shift_variance(
 p_shift_id uuid
)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_shift public.carwash_shifts%rowtype;
begin
 if private.current_app_role()<>'owner' or (select auth.uid()) is null
 then raise exception 'Owner account required to approve POS/cash variance'; end if;
 select * into v_shift from public.carwash_shifts
 where id=p_shift_id for update;
 if not found or v_shift.status<>'awaiting_owner'
 then raise exception 'No pending difference for shift'; end if;
 update public.carwash_shift_settlements set
 variance_approved_by=(select auth.uid()),variance_approved_at=now()
 where shift_id=p_shift_id;
 update public.carwash_shifts set status='approved',
  approved_at=now(),approved_by=(select auth.uid()) where id=p_shift_id;
 insert into public.carwash_shifts(status) values('open');
 return true;
end $$;
revoke all on function public.approve_carwash_shift_variance(uuid) from public,anon;
grant execute on function public.approve_carwash_shift_variance(uuid) to authenticated;


-- Freeze financial rows once the manager has submitted a final settlement
-- (including awaiting owner approval). Ready notices are still permitted.
create or replace function private.prevent_settled_shift_edits()
returns trigger language plpgsql security definer set search_path='' as $
declare v_status text;
begin
 if new.shift_id is distinct from old.shift_id then
  raise exception 'Cannot move a car across financial shifts';
 end if;
 select status into v_status from public.carwash_shifts
  where id=old.shift_id for share;
 if v_status in ('approved','awaiting_owner') then
  raise exception 'Shift already submitted; financial rows are frozen';
 end if;
 return new;
end $;
revoke all on function private.prevent_settled_shift_edits() from public;
create trigger carwash_no_edit_after_shift_settlement
 before update of car_type,service_type,cash_paid,card_paid,discount_amount,
  deleted_at,occurred_at,shift_id on public.entries
 for each row execute function private.prevent_settled_shift_edits();

-- No direct authenticated table mutation of sessions, device seals or
-- financial settlements: user writes happen only through guarded RPCs.
revoke insert,update,delete on public.carwash_shifts from anon,authenticated;
revoke insert,update,delete on public.carwash_shift_devices from anon,authenticated;
revoke insert,update,delete on public.carwash_shift_settlements from anon,authenticated;

-- Shared worker account must not retrieve archived/approved shifts even via
-- direct PostgREST queries. Owner/manager retain full audit history.
drop policy if exists shared_staff_account_entries on public.entries;
create policy shared_staff_account_active_shift_entries on public.entries
 for select to authenticated using(
 private.current_app_role() in ('owner','manager')
 or (
  private.current_app_role()='worker'
  and created_by=(select auth.uid())
  and exists(
   select 1 from public.carwash_shifts s where s.id=shift_id
   and s.status in ('open','awaiting_owner')
  )
 )
);
