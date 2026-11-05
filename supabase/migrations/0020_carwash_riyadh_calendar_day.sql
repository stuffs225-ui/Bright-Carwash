-- Bright-Carwash V2 (isolated, not WorkshopOS): midnight-to-midnight Riyadh calendar settlement.
-- Applied only to the standalone Carwash Supabase database. Old shift tables
-- remain for historical audit, but are not used by new worker/manager flows.

create table if not exists public.carwash_days(
 id uuid not null default gen_random_uuid() unique,
 business_date date primary key,
 status text not null default 'open' check(status in('open','awaiting_owner','approved')),
 created_at timestamptz not null default now(),
 approved_at timestamptz,
 approved_by uuid references auth.users(id)
);
alter table public.carwash_days enable row level security;
create index if not exists carwash_days_status_idx on public.carwash_days(status,business_date desc);
create policy carwash_days_member_read on public.carwash_days
 for select to authenticated using(
 private.current_app_role() in('owner','manager')
 or (private.current_app_role()='worker' and status<>'approved')
);
grant select on public.carwash_days to authenticated;
revoke insert,update,delete on public.carwash_days from anon,authenticated;

create table if not exists public.carwash_registered_devices(
 id uuid not null default gen_random_uuid() unique,
 device_id uuid primary key,
 account_id uuid not null references auth.users(id),
 active boolean not null default true,
 registered_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now()
);
alter table public.carwash_registered_devices enable row level security;
create policy carwash_registered_devices_read on public.carwash_registered_devices
 for select to authenticated using(
 private.current_app_role() in('owner','manager') or account_id=(select auth.uid())
);
grant select on public.carwash_registered_devices to authenticated;
revoke insert,update,delete on public.carwash_registered_devices from anon,authenticated;

create table if not exists public.carwash_day_devices(
 business_date date not null references public.carwash_days(business_date),
 device_id uuid not null references public.carwash_registered_devices(device_id),
 account_id uuid not null references auth.users(id),
 last_seen_at timestamptz not null default now(),
 sealed_at timestamptz,
 primary key(business_date,device_id)
);
alter table public.carwash_day_devices enable row level security;
create policy carwash_day_devices_read on public.carwash_day_devices
 for select to authenticated using(
 private.current_app_role() in('owner','manager') or account_id=(select auth.uid())
);
grant select on public.carwash_day_devices to authenticated;
revoke insert,update,delete on public.carwash_day_devices from anon,authenticated;

create or replace function private.carwash_day_device_initialize()
returns trigger language plpgsql security definer set search_path=''
as $carwash_day_init$
begin
 insert into public.carwash_day_devices(business_date,device_id,account_id)
 select new.business_date,d.device_id,d.account_id
 from public.carwash_registered_devices d where d.active=true
 on conflict do nothing;
 return new;
end
$carwash_day_init$;
revoke all on function private.carwash_day_device_initialize() from public;
create trigger carwash_seed_day_devices after insert on public.carwash_days
 for each row execute function private.carwash_day_device_initialize();

create or replace function public.enroll_carwash_worker_device(p_device_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $carwash_device_enroll$
declare v_day record;
begin
 if private.current_app_role()<>'worker' or (select auth.uid()) is null
 then raise exception 'Only an authorized carwash worker can enroll a device';end if;
 if p_device_id is null then raise exception 'Device ID required';end if;
 insert into public.carwash_registered_devices(device_id,account_id,active)
 values(p_device_id,(select auth.uid()),true)
 on conflict(device_id) do update set last_seen_at=now()
 where public.carwash_registered_devices.account_id=(select auth.uid())
   and public.carwash_registered_devices.active=true;
 if not found then raise exception 'Device enrolled to another account or disabled';end if;
 -- Lock day rows to serialize enrollment against management approval.
 for v_day in select business_date from public.carwash_days
  where status='open' order by business_date for share loop
  insert into public.carwash_day_devices(business_date,device_id,account_id)
  values(v_day.business_date,p_device_id,(select auth.uid()))
  on conflict(business_date,device_id) do update set last_seen_at=now()
  where public.carwash_day_devices.account_id=(select auth.uid());
 end loop;
 return true;
end
$carwash_device_enroll$;
revoke all on function public.enroll_carwash_worker_device(uuid) from public,anon;
grant execute on function public.enroll_carwash_worker_device(uuid) to authenticated;

-- Drop the old cross-midnight settlement attachment. Every new entry is
-- assigned to the actual Riyadh local date from its captured occurred_at.
drop trigger if exists carwash_attach_shift_before_entry on public.entries;
alter table public.entries add column if not exists business_date date;
update public.entries
 set business_date=(occurred_at at time zone 'Asia/Riyadh')::date
 where business_date is null and legacy_ref is null;

insert into public.carwash_days(business_date,status)
select e.business_date,
 case when bool_and(s.status='approved') then 'approved' else 'open' end
from public.entries e
left join public.carwash_shifts s on e.shift_id=s.id
where e.business_date is not null
group by e.business_date
on conflict(business_date) do nothing;

create index if not exists carwash_entries_business_date_idx
 on public.entries(business_date,occurred_at desc);

create or replace function private.attach_carwash_business_date()
returns trigger language plpgsql security definer set search_path=''
as $carwash_attach_day$
declare v_date date;v_status text;v_now_date date;v_role text;
begin
 if new.legacy_ref is not null then return new;end if;
 v_role:=private.current_app_role();
 if v_role not in('owner','manager','worker') then
  raise exception 'Carwash membership required';end if;
 v_date:=(new.occurred_at at time zone 'Asia/Riyadh')::date;
 v_now_date:=(now() at time zone 'Asia/Riyadh')::date;
 if v_role='worker' and (v_date>v_now_date or v_date<v_now_date-14) then
  raise exception 'Worker cannot register car with impossible date';end if;
 if new.business_date is not null and new.business_date<>v_date
 then raise exception 'Business date does not match occurred_at in Riyadh';end if;
 new.business_date:=v_date;
 insert into public.carwash_days(business_date)
 values(v_date) on conflict(business_date) do nothing;
 select status into v_status from public.carwash_days
 where business_date=v_date for share;
 if v_status<>'open' then
  raise exception 'Carwash day % is already under review or approved',v_date;end if;
 if v_role='worker' then
  if new.device_id is null then
   raise exception 'Register staff device online before recording a vehicle';end if;
  if not exists(
   select 1 from public.carwash_registered_devices d
   where d.device_id=new.device_id and d.account_id=(select auth.uid())
     and d.active=true
  ) then raise exception 'Unrecognized staff device';end if;
  -- In case the day was created when the device was previously offline.
  insert into public.carwash_day_devices(business_date,device_id,account_id)
  values(v_date,new.device_id,(select auth.uid()))
  on conflict do nothing;
  if not exists(
   select 1 from public.carwash_day_devices d
    where d.business_date=v_date and d.device_id=new.device_id
    and d.account_id=(select auth.uid()) and d.sealed_at is null
  ) then raise exception 'Staff device sealed for this business day';end if;
  update public.carwash_day_devices set last_seen_at=now()
   where business_date=v_date and device_id=new.device_id;
 end if;
 return new;
end
$carwash_attach_day$;
revoke all on function private.attach_carwash_business_date() from public;
create trigger carwash_attach_business_date_before_insert before insert
 on public.entries for each row execute function private.attach_carwash_business_date();

create or replace function private.freeze_carwash_settled_day()
returns trigger language plpgsql security definer set search_path=''
as $carwash_freeze_day$
declare v_status text;v_old_day date;v_new_day date;
begin
 v_old_day:=old.business_date;
 if v_old_day is null then return new;end if;
 v_new_day:=(new.occurred_at at time zone 'Asia/Riyadh')::date;
 if new.business_date is distinct from v_old_day or v_new_day<>v_old_day
 then raise exception 'Cannot move a recorded car across business dates';end if;
 select status into v_status from public.carwash_days
 where business_date=v_old_day for share;
 if v_status<>'open' then raise exception 'Approved/reviewed day is frozen';end if;
 return new;
end
$carwash_freeze_day$;
revoke all on function private.freeze_carwash_settled_day() from public;
create trigger carwash_freeze_day_before_financial_edit
 before update of car_type,service_type,cash_paid,card_paid,discount_amount,
 deleted_at,occurred_at,business_date,addon_ids
 on public.entries for each row execute function private.freeze_carwash_settled_day();

-- A shared worker account sees entries from ALL unapproved dates, including
-- yesterday and today. The moment one day becomes approved it disappears;
-- other days remain visible, even if more than two are pending.
do $carwash_drop_old_worker_select$
declare x record;
begin
 for x in select policyname from pg_policies
 where schemaname='public' and tablename='entries'
 and cmd in('SELECT','ALL')
 loop execute format('drop policy if exists %I on public.entries',x.policyname);end loop;
end
$carwash_drop_old_worker_select$;
create policy carwash_calendar_entry_read on public.entries
 for select to authenticated using(
 private.current_app_role() in('owner','manager')
 or (private.current_app_role()='worker' and created_by=(select auth.uid())
  and business_date is not null and exists(
   select 1 from public.carwash_days d
   where d.business_date=entries.business_date and d.status<>'approved'
  ))
);
grant select on public.entries to authenticated;

create or replace function public.seal_carwash_business_day(p_date date,p_device_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $carwash_seal_day$
declare v_status text;v_today date;
begin
 if private.current_app_role()<>'worker' then raise exception 'Staff account required';end if;
 v_today:=(now() at time zone 'Asia/Riyadh')::date;
 if p_date>=v_today then raise exception 'Current Riyadh business day is not finished';end if;
 select status into v_status from public.carwash_days
 where business_date=p_date for share;
 if v_status<>'open' then raise exception 'Only an open completed day may be sealed';end if;
 update public.carwash_day_devices set sealed_at=now(),last_seen_at=now()
 where business_date=p_date and device_id=p_device_id
 and account_id=(select auth.uid()) and sealed_at is null;
 if not found then raise exception 'Staff device not enrolled for this day or already sealed';end if;
 -- Client may call only after confirming local outbox is empty. Server still
 -- cannot see unuploaded records from an offline/lost device.
 return true;
end
$carwash_seal_day$;
revoke all on function public.seal_carwash_business_day(date,uuid) from public,anon;
grant execute on function public.seal_carwash_business_day(date,uuid) to authenticated;

create table if not exists public.carwash_day_settlements(
 id uuid not null default gen_random_uuid() unique,
 business_date date primary key references public.carwash_days(business_date),
 recorded_cash numeric(12,2) not null check(recorded_cash>=0),
 recorded_card numeric(12,2) not null check(recorded_card>=0),
 actual_cash numeric(12,2) not null check(actual_cash>=0),
 terminal_card numeric(12,2) not null check(terminal_card>=0),
 cash_difference numeric(12,2) not null,
 card_difference numeric(12,2) not null,
 cars integer not null check(cars>=0),
 collective_tens numeric(12,2) not null check(collective_tens>=0),
 report_object_path text not null,
 difference_reason text,
 manager_id uuid not null references auth.users(id),
 manager_reviewed_at timestamptz not null default now(),
 variance_approved_by uuid references auth.users(id),
 variance_approved_at timestamptz,
 constraint carwash_day_difference_reason_required check(
  (cash_difference=0 and card_difference=0)
  or length(trim(coalesce(difference_reason,'')))>=5
 )
);
alter table public.carwash_day_settlements enable row level security;
create policy carwash_day_settlement_manager_read on public.carwash_day_settlements
 for select to authenticated using(private.current_app_role() in('manager','owner'));
grant select on public.carwash_day_settlements to authenticated;
revoke insert,update,delete on public.carwash_day_settlements from anon,authenticated;

create or replace function public.submit_carwash_day_settlement(
 p_date date,p_actual_cash numeric,p_terminal_card numeric,p_report_path text,
 p_reason text default null
) returns text language plpgsql security definer set search_path=''
as $carwash_day_settle$
declare v_day public.carwash_days%rowtype;v_cash numeric(12,2);
 v_card numeric(12,2);v_count integer;v_cash_diff numeric(12,2);
 v_card_diff numeric(12,2);v_today date;
begin
 if private.current_app_role() not in('manager','owner') then
  raise exception 'Manager authorization required';end if;
 v_today:=(now() at time zone 'Asia/Riyadh')::date;
 if p_date>=v_today then raise exception 'This Riyadh calendar day has not ended';end if;
 select * into v_day from public.carwash_days where business_date=p_date for update;
 if not found or v_day.status<>'open' then raise exception 'Day is not open';end if;
 if p_actual_cash is null or p_terminal_card is null or
   p_actual_cash<0 or p_terminal_card<0 then
  raise exception 'Invalid cash or POS total';end if;
 if exists(select 1 from public.carwash_day_devices
  where business_date=p_date and sealed_at is null) then
  raise exception 'All registered devices must sync and seal this day';end if;
 if p_report_path is null or p_report_path not like 'day/'||p_date::text||'/%'
 or not exists(select 1 from storage.objects
  where bucket_id='carwash-pos-evidence' and name=p_report_path)
 then raise exception 'Verified POS statement attachment required';end if;
 select coalesce(sum(cash_paid),0),coalesce(sum(card_paid),0),count(*)::integer
 into v_cash,v_card,v_count from public.entries
 where business_date=p_date and deleted_at is null;
 v_cash_diff:=p_actual_cash-v_cash;v_card_diff:=p_terminal_card-v_card;
 if (v_cash_diff<>0 or v_card_diff<>0) and
 length(trim(coalesce(p_reason,'')))<5 then
  raise exception 'Variance requires a written reason and owner review';end if;
 insert into public.carwash_day_settlements(
 business_date,recorded_cash,recorded_card,actual_cash,terminal_card,
 cash_difference,card_difference,cars,collective_tens,
 report_object_path,difference_reason,manager_id
 ) values(p_date,v_cash,v_card,p_actual_cash,p_terminal_card,
 v_cash_diff,v_card_diff,v_count,v_count*10,p_report_path,
 nullif(trim(coalesce(p_reason,'')),''),(select auth.uid()));
 if v_cash_diff<>0 or v_card_diff<>0 then
  update public.carwash_days set status='awaiting_owner' where business_date=p_date;
  return 'awaiting_owner';
 end if;
 update public.carwash_days set status='approved',approved_at=now(),
 approved_by=(select auth.uid()) where business_date=p_date;
 return 'approved';
end
$carwash_day_settle$;
revoke all on function public.submit_carwash_day_settlement(date,numeric,numeric,text,text) from public,anon;
grant execute on function public.submit_carwash_day_settlement(date,numeric,numeric,text,text) to authenticated;

create or replace function public.approve_carwash_day_difference(p_date date)
returns boolean language plpgsql security definer set search_path=''
as $carwash_day_variance$
declare v_day public.carwash_days%rowtype;
begin
 if private.current_app_role()<>'owner' then raise exception 'Owner approval required';end if;
 select * into v_day from public.carwash_days where business_date=p_date for update;
 if not found or v_day.status<>'awaiting_owner' then raise exception 'No pending variance';end if;
 update public.carwash_day_settlements set variance_approved_by=(select auth.uid()),
 variance_approved_at=now() where business_date=p_date;
 update public.carwash_days set status='approved',approved_by=(select auth.uid()),
 approved_at=now() where business_date=p_date;
 return true;
end
$carwash_day_variance$;
revoke all on function public.approve_carwash_day_difference(date) from public,anon;
grant execute on function public.approve_carwash_day_difference(date) to authenticated;

create trigger audit_change after insert or update on public.carwash_days
 for each row execute function private.audit_row();
create trigger audit_change after insert on public.carwash_registered_devices
 for each row execute function private.audit_row();
create trigger audit_change after insert or update on public.carwash_day_settlements
 for each row execute function private.audit_row();

comment on table public.carwash_days is
 'Local Riyadh 00:00..23:59 business days; each date approved independently';
