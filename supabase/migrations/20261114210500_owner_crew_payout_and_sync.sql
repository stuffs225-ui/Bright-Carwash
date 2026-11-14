-- Owner-approved financial policy, effective for open 2026-11-14 and later.
-- Historic revenue, paid expenses, closed days and approved settlements are immutable.
create table if not exists public.carwash_crew_payouts (
 business_date date primary key references public.carwash_days(business_date),
 cash_paid numeric(12,2) not null default 0 check (cash_paid>=0 and cash_paid<=100000),
 bank_paid numeric(12,2) not null default 0 check (bank_paid>=0 and bank_paid<=100000),
 note text not null default '' check (length(note)<=500),
 recorded_by uuid not null,
 recorded_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint carwash_crew_payout_from_approval check (business_date>=date '2026-11-14')
);
alter table public.carwash_crew_payouts enable row level security;
revoke all on public.carwash_crew_payouts from public,anon,authenticated;
grant select on public.carwash_crew_payouts to authenticated;
create policy carwash_crew_payout_manager_read on public.carwash_crew_payouts
 for select to authenticated using (private.current_app_role() in ('manager','owner'));

create table if not exists private.carwash_crew_payout_audit (
 id bigint generated always as identity primary key,
 business_date date not null,
 previous_cash numeric(12,2),
 previous_bank numeric(12,2),
 previous_note text,
 revised_cash numeric(12,2) not null,
 revised_bank numeric(12,2) not null,
 revised_note text not null,
 actor_user uuid not null,
 changed_at timestamptz not null default now()
);
revoke all on private.carwash_crew_payout_audit from public,anon,authenticated;

create or replace function public.carwash_record_crew_payout(
 p_date date,p_cash numeric,p_bank numeric,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_due numeric(12,2);
 v_old public.carwash_crew_payouts%rowtype;
 v_note text:=coalesce(btrim(p_note),'');
 v_actor uuid:=auth.uid();
begin
 if v_actor is null or coalesce(private.current_app_role(),'none') not in ('manager','owner')
 then raise exception 'Manager authorization required';end if;
 if p_date is null or p_date<date '2026-11-14'
 or p_cash is null or p_bank is null
 or p_cash<0 or p_bank<0 or p_cash>100000 or p_bank>100000
 or p_cash<>round(p_cash,2) or p_bank<>round(p_bank,2)
 or length(v_note)>500 then raise exception 'Invalid crew payout';end if;
 perform 1 from public.carwash_days
  where business_date=p_date and status='open' for update;
 if not found then raise exception 'Day must be open to register crew payout';end if;
 select count(*)*10 into v_due from public.entries
 where business_date=p_date and deleted_at is null
 and car_type in ('سيارة صغيرة','سيارة كبيرة','شاحنة');
 if p_cash+p_bank>v_due then raise exception 'Team payout exceeds accrued collective tens';end if;
 select * into v_old from public.carwash_crew_payouts
  where business_date=p_date for update;
 if found then
  if v_old.cash_paid<>p_cash or v_old.bank_paid<>p_bank or v_old.note<>v_note then
   insert into private.carwash_crew_payout_audit(
     business_date,previous_cash,previous_bank,previous_note,
     revised_cash,revised_bank,revised_note,actor_user)
   values(p_date,v_old.cash_paid,v_old.bank_paid,v_old.note,p_cash,p_bank,v_note,v_actor);
   update public.carwash_crew_payouts set cash_paid=p_cash,bank_paid=p_bank,
    note=v_note,recorded_by=v_actor,updated_at=now()
    where business_date=p_date;
  end if;
 else
  insert into private.carwash_crew_payout_audit(
   business_date,revised_cash,revised_bank,revised_note,actor_user)
  values(p_date,p_cash,p_bank,v_note,v_actor);
  insert into public.carwash_crew_payouts(
   business_date,cash_paid,bank_paid,note,recorded_by)
  values(p_date,p_cash,p_bank,v_note,v_actor);
 end if;
 return jsonb_build_object('ok',true,'cashPaid',p_cash,'bankPaid',p_bank,
  'due',v_due,'remaining',v_due-p_cash-p_bank);
end $fn$;
revoke all on function public.carwash_record_crew_payout(date,numeric,numeric,text)
 from public,anon,authenticated;
grant execute on function public.carwash_record_crew_payout(date,numeric,numeric,text)
 to authenticated;

-- Reconfigure existing routines in-place to preserve signatures and grants.
-- Assert each expected source fragment, rather than silently shipping a partial migration.
do $patch$
declare v_sql text;
begin
 select pg_get_functiondef('private.sync_daily_crew_expense(date)'::regprocedure) into v_sql;
 if position('and car_type in (''سيارة صغيرة'',''سيارة كبيرة'')' in v_sql)=0
 then raise exception 'Unexpected crew expense function shape';end if;
 v_sql:=replace(v_sql,
  'and car_type in (''سيارة صغيرة'',''سيارة كبيرة'')',
  'and ((p_day >= date ''2026-11-14'' and car_type in (''سيارة صغيرة'',''سيارة كبيرة'',''شاحنة'')) or (p_day < date ''2026-11-14'' and car_type in (''سيارة صغيرة'',''سيارة كبيرة'')))');
 execute v_sql;

 select pg_get_functiondef('public.carwash_manager_close_day(date,numeric,numeric,text,text,boolean)'::regprocedure) into v_sql;
 if position('if v_unsealed>0 and not coalesce(p_confirm_unsynced,false)' in v_sql)=0
 then raise exception 'Unexpected manager device bypass shape';end if;
 v_sql:=replace(v_sql,'if v_unsealed>0 and not coalesce(p_confirm_unsynced,false)',
   'if v_unsealed>0');
 v_sql:=replace(v_sql,
  'Manager must acknowledge unsynced worker devices',
  'All registered devices must sync and seal this day');
 if position('v_expected:=v_cash-v_expenses-v_payouts+v_movement;' in v_sql)=0
 then raise exception 'Unexpected manager cash reconciliation shape';end if;
 v_sql:=replace(v_sql,'v_expected:=v_cash-v_expenses-v_payouts+v_movement;',
  'if coalesce((select c.cash_paid+c.bank_paid from public.carwash_crew_payouts c where c.business_date=p_date),0)>v_crew*10 then raise exception ''Crew payout exceeds due'';end if;
   v_payouts:=v_payouts+coalesce((select c.cash_paid from public.carwash_crew_payouts c where c.business_date=p_date),0);
   v_expected:=v_cash-v_expenses-v_payouts+v_movement;');
 execute v_sql;

 select pg_get_functiondef('public.submit_carwash_day_settlement(date,numeric,numeric,text,text)'::regprocedure) into v_sql;
 if position('v_expected_cash:=v_cash-v_cash_expenses-v_cash_worker_payments+v_cash_movements_net;' in v_sql)=0
 then raise exception 'Unexpected report settlement cash reconciliation shape';end if;
 v_sql:=replace(v_sql,'v_expected_cash:=v_cash-v_cash_expenses-v_cash_worker_payments+v_cash_movements_net;',
  'if coalesce((select c.cash_paid+c.bank_paid from public.carwash_crew_payouts c where c.business_date=p_date),0)>v_crew_count*10 then raise exception ''Crew payout exceeds due'';end if;
   v_cash_worker_payments:=v_cash_worker_payments+coalesce((select c.cash_paid from public.carwash_crew_payouts c where c.business_date=p_date),0);
   v_expected_cash:=v_cash-v_cash_expenses-v_cash_worker_payments+v_cash_movements_net;');
 execute v_sql;
end $patch$;

-- Only an unapproved day can be revalued. Previously approved rows remain frozen.
do $recalc$ begin
 perform private.sync_daily_crew_expense((now() at time zone 'Asia/Riyadh')::date);
end $recalc$;
