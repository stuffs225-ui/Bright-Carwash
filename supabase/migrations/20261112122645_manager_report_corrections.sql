-- Owner approved manager-authored corrections, preserving each original handoff.
create table public.carwash_report_corrections(
 id uuid primary key default gen_random_uuid(),
 business_date date not null references public.carwash_worker_day_reports(business_date),
 version integer not null check(version>0),
 actual_cash numeric(12,2) not null check(actual_cash>=0),
 actual_card numeric(12,2) not null check(actual_card>=0),
 terminal_total numeric(12,2) not null check(terminal_total>=0),
 reason text not null check(length(btrim(reason)) between 5 and 500),
 before_values jsonb not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 request_id uuid not null unique,
 unique(business_date,version)
);
alter table public.carwash_report_corrections enable row level security;
revoke all on public.carwash_report_corrections from public,anon,authenticated;
grant select,insert on public.carwash_report_corrections to service_role;
create index carwash_report_corrections_actor on public.carwash_report_corrections(created_by);
create or replace function public.carwash_correct_pending_report(
 p_manager uuid,p_day date,p_cash numeric,p_card numeric,p_terminal numeric,p_reason text,p_request uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.carwash_worker_day_reports%rowtype;c public.carwash_report_corrections%rowtype;
 v_before jsonb;v_version integer:=1;v_id uuid;
begin
 if not exists(select 1 from public.app_members where user_id=p_manager and active and role='manager')
 then raise exception 'Manager authorization required';end if;
 if p_request is null or p_cash is null or p_card is null or p_terminal is null
 or least(p_cash,p_card,p_terminal)<0 or greatest(p_cash,p_card,p_terminal)>10000000
 or p_cash<>round(p_cash,2) or p_card<>round(p_card,2) or p_terminal<>round(p_terminal,2)
 or coalesce(length(btrim(p_reason)),0) not between 5 and 500 then raise exception 'Invalid correction';end if;
 -- Serialize correction and approval. Original report and all earlier versions stay unchanged.
 perform 1 from public.carwash_days where business_date=p_day for update;
 select * into c from public.carwash_report_corrections where request_id=p_request;
 if found then
  if c.business_date<>p_day or c.created_by<>p_manager or c.actual_cash<>p_cash
   or c.actual_card<>p_card or c.terminal_total<>p_terminal or c.reason<>btrim(p_reason)
  then raise exception 'Correction request conflict';end if;
  return jsonb_build_object('ok',true,'id',c.id,'duplicate',true);
 end if;
 if not exists(select 1 from public.carwash_days where business_date=p_day and status='open')
 then raise exception 'Report already settled; independent financial correction required';end if;
 if exists(select 1 from public.accounting_months where period=to_char(p_day,'YYYY-MM') and status='approved')
 then raise exception 'Month already approved';end if;
 select * into r from public.carwash_worker_day_reports where business_date=p_day;
 if not found then raise exception 'Report required';end if;
 select * into c from public.carwash_report_corrections where business_date=p_day order by version desc limit 1;
 if found then
  v_version:=c.version+1;
  v_before:=jsonb_build_object('cash',c.actual_cash,'card',c.actual_card,'terminal',c.terminal_total);
 else
  v_before:=jsonb_build_object('cash',r.actual_cash,'card',r.actual_card,'terminal',r.terminal_total);
 end if;
 insert into public.carwash_report_corrections(business_date,version,actual_cash,actual_card,terminal_total,reason,before_values,created_by,request_id)
 values(p_day,v_version,p_cash,p_card,p_terminal,btrim(p_reason),v_before,p_manager,p_request) returning id into v_id;
 return jsonb_build_object('ok',true,'id',v_id,'duplicate',false);
end $$;
revoke all on function public.carwash_correct_pending_report(uuid,date,numeric,numeric,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.carwash_correct_pending_report(uuid,date,numeric,numeric,numeric,text,uuid) to service_role;
create or replace function public.carwash_approve_worker_report(p_date date,p_reason text default null)
 returns text language plpgsql security definer set search_path='' as $$
declare r public.carwash_worker_day_reports%rowtype;c public.carwash_report_corrections%rowtype;
begin
 if coalesce(private.current_app_role(),'none') not in ('manager','owner') then
  raise exception 'Manager authorization required';end if;
 perform 1 from public.carwash_days where business_date=p_date for update;
 select * into r from public.carwash_worker_day_reports where business_date=p_date;
 if not found then raise exception 'Worker report required';end if;
 select * into c from public.carwash_report_corrections where business_date=p_date order by version desc limit 1;
 if found then r.actual_cash:=c.actual_cash;r.actual_card:=c.actual_card;r.terminal_total:=c.terminal_total;end if;
 if r.actual_card<>r.terminal_total and length(trim(coalesce(p_reason,'')))<5 then
  raise exception 'Reported network difference requires reason';end if;
 return public.submit_carwash_day_settlement(p_date,r.actual_cash,r.terminal_total,r.report_object_path,p_reason);
end $$;
