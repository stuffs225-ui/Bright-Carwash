-- Only operational days with explicit business_date are included.
-- Never rewrite imported historical revenue/expense rows.
alter table public.expenses add column if not exists crew_business_date date;
create unique index if not exists carwash_daily_crew_expense_unique
 on public.expenses(crew_business_date) where crew_business_date is not null;

create or replace function private.sync_daily_crew_expense(p_day date)
 returns void language plpgsql security definer set search_path='' as $$
declare v_total numeric; v_manager uuid; v_existing uuid;
begin
 if p_day is null then return; end if;
 -- The day row serializes concurrent registrations and final approval.
 perform 1 from public.carwash_days where business_date=p_day for update;
 if not found then return; end if;
 if exists(select 1 from public.carwash_days where business_date=p_day and status<>'open') then return;end if;
 select count(*)*10 into v_total from public.entries
  where business_date=p_day and deleted_at is null
    and car_type in ('سيارة صغيرة','سيارة كبيرة');
 select id into v_existing from public.expenses where crew_business_date=p_day;
 if v_total=0 then
  if v_existing is not null then update public.expenses set deleted_at=now() where id=v_existing;end if;
  return;
 end if;
 select user_id into v_manager from public.app_members where active and role='manager' limit 1;
 if v_manager is null then raise exception 'Manager required for collective accrual';end if;
 insert into public.expenses(expense_type,amount,notes,occurred_at,created_by,
  recognition_kind,payment_source,crew_business_date,client_mutation_id)
 values('أجور العمال',v_total,'أجور فريق الغسيل ليوم '||p_day::text||' (10 ريالات لكل سيارة)',
  (p_day::timestamp+interval '12 hours') at time zone 'Asia/Riyadh',v_manager,
  'salary_accrual',null,p_day,'crew-day:'||p_day::text)
 on conflict (crew_business_date) where crew_business_date is not null
 do update set amount=excluded.amount,notes=excluded.notes,deleted_at=null;
end $$;
revoke all on function private.sync_daily_crew_expense(date) from public,anon,authenticated;
create or replace function private.sync_daily_crew_entry_trigger()
 returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then perform private.sync_daily_crew_expense(OLD.business_date);return OLD;end if;
 if TG_OP='UPDATE' and OLD.business_date is distinct from NEW.business_date then
  perform private.sync_daily_crew_expense(OLD.business_date);
 end if;
 perform private.sync_daily_crew_expense(NEW.business_date);
 return NEW;
end $$;
revoke all on function private.sync_daily_crew_entry_trigger() from public,anon,authenticated;
drop trigger if exists carwash_crew_expense_sync on public.entries;
create trigger carwash_crew_expense_sync after insert or update of car_type,business_date,deleted_at or delete
 on public.entries for each row execute function private.sync_daily_crew_entry_trigger();

-- Automated collective wages are not editable through the manual expense form.
create or replace function private.guard_daily_crew_expense()
 returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if TG_OP='DELETE' then
   if OLD.crew_business_date is not null then raise exception 'Automatic crew expense cannot be edited manually';end if;
  elsif TG_OP='INSERT' then
   if NEW.crew_business_date is not null then raise exception 'Automatic crew expense cannot be created manually';end if;
  elsif OLD.crew_business_date is not null or NEW.crew_business_date is not null then
   raise exception 'Automatic crew expense cannot be edited manually';
  end if;
 end if;
 if TG_OP='DELETE' then return OLD;end if;return NEW;
end $$;
drop trigger if exists carwash_guard_daily_crew_expense on public.expenses;
create trigger carwash_guard_daily_crew_expense before insert or update or delete on public.expenses
 for each row execute function private.guard_daily_crew_expense();

-- One immutable worker handoff per day, separate from the manager approval.
create table if not exists public.carwash_worker_day_reports(
 business_date date primary key references public.carwash_days(business_date),
 actual_cash numeric(12,2) not null check(actual_cash>=0),
 actual_card numeric(12,2) not null check(actual_card>=0),
 terminal_total numeric(12,2) not null check(terminal_total>=0),
 report_object_path text not null,
 worker_link_id uuid not null references public.carwash_worker_links(id),
 submitted_at timestamptz not null default now()
);
alter table public.carwash_worker_day_reports enable row level security;
revoke all on public.carwash_worker_day_reports from public,anon,authenticated;
grant select,insert on public.carwash_worker_day_reports to service_role;
create or replace function public.carwash_submit_worker_day_report(
 p_date date,p_cash numeric,p_card numeric,p_terminal numeric,p_path text,p_link uuid
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_date >= (now() at time zone 'Asia/Riyadh')::date then raise exception 'Day has not ended';end if;
 if not exists(select 1 from public.carwash_worker_links l join public.app_members m on m.user_id=l.created_by
 where l.id=p_link and l.revoked_at is null and l.expires_at>now() and m.active and m.role='manager') then raise exception 'Worker link unavailable';end if;
 perform 1 from public.carwash_days where business_date=p_date and status='open' for update;
 if not found then raise exception 'Day not open';end if;
 if exists(select 1 from public.carwash_worker_day_reports where business_date=p_date) then return false;end if;
 if p_cash is null or p_card is null or p_terminal is null
 or least(p_cash,p_card,p_terminal)<0 or greatest(p_cash,p_card,p_terminal)>10000000
 or p_path not like 'day/'||p_date::text||'/%'
 or not exists(select 1 from storage.objects where bucket_id='carwash-pos-evidence' and name=p_path)
 then raise exception 'Invalid report';end if;
 insert into public.carwash_worker_day_reports(business_date,actual_cash,actual_card,terminal_total,report_object_path,worker_link_id)
 values(p_date,p_cash,p_card,p_terminal,p_path,p_link);
 return true;
end $$;
revoke all on function public.carwash_submit_worker_day_report(date,numeric,numeric,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.carwash_submit_worker_day_report(date,numeric,numeric,numeric,text,uuid) to service_role;

-- Existing approved days and imported entries remain unchanged. Bring only
-- existing open operational days into the new collective expense ledger.
do $$ declare d date;begin
 for d in select business_date from public.carwash_days where status='open'
 loop perform private.sync_daily_crew_expense(d);end loop;
end $$;
