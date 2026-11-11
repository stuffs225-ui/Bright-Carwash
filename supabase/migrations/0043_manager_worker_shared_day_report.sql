-- Manager and worker share the same immutable day-report handoff.
-- Each report belongs to exactly one source; no rewriting past submitted reports.
alter table public.carwash_worker_day_reports
  alter column worker_link_id drop not null;
alter table public.carwash_worker_day_reports
  add column if not exists manager_user_id uuid references auth.users(id);
alter table public.carwash_worker_day_reports
  add constraint carwash_day_report_source_exactly_one
  check ((worker_link_id is not null and manager_user_id is null)
     or (worker_link_id is null and manager_user_id is not null));

create or replace function public.carwash_submit_manager_day_report(
 p_date date,p_cash numeric,p_card numeric,p_terminal numeric,p_path text,p_manager uuid
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_date is null or p_date >= (now() at time zone 'Asia/Riyadh')::date
 then raise exception 'Day has not ended'; end if;
 if p_manager is null or not exists (
  select 1 from public.app_members m where m.user_id=p_manager
  and m.role='manager' and m.active
 ) then raise exception 'Manager authorization required';end if;
 perform 1 from public.carwash_days where business_date=p_date and status='open' for update;
 if not found then raise exception 'Day not open';end if;
 if exists(select 1 from public.carwash_worker_day_reports where business_date=p_date)
 then return false;end if;
 if p_cash is null or p_card is null or p_terminal is null
 or least(p_cash,p_card,p_terminal)<0 or greatest(p_cash,p_card,p_terminal)>10000000
 or p_cash<>round(p_cash,2) or p_card<>round(p_card,2) or p_terminal<>round(p_terminal,2)
 or p_path is null or p_path not like 'day/'||p_date::text||'/%'
 or not exists(select 1 from storage.objects
  where bucket_id='carwash-pos-evidence' and name=p_path)
 then raise exception 'Invalid report';end if;
 insert into public.carwash_worker_day_reports(
  business_date,actual_cash,actual_card,terminal_total,report_object_path,manager_user_id
 ) values(p_date,p_cash,p_card,p_terminal,p_path,p_manager);
 return true;
end $$;
revoke all on function public.carwash_submit_manager_day_report(date,numeric,numeric,numeric,text,uuid)
 from public,anon,authenticated;
grant execute on function public.carwash_submit_manager_day_report(date,numeric,numeric,numeric,text,uuid)
 to service_role;
