
-- Approved daily close UX: manager may close without a worker-submitted report
-- or a photo, but the amounts and any bypass are independently auditable.
insert into public.car_types(name,active,sort_order)
select 'شاحنة',true,7
where not exists (select 1 from public.car_types where name='شاحنة');

alter table public.carwash_day_settlements
 alter column report_object_path drop not null;
alter table public.carwash_day_settlements
 add column if not exists approval_mode text not null default 'worker_report',
 add column if not exists unsealed_device_override_count integer not null default 0,
 add column if not exists worker_report_present boolean not null default true;
do $chk$ begin
 if not exists(select 1 from pg_constraint
  where conrelid='public.carwash_day_settlements'::regclass
   and conname='carwash_day_settlement_approval_mode_ck')
 then
  alter table public.carwash_day_settlements add constraint carwash_day_settlement_approval_mode_ck
   check (approval_mode in ('worker_report','manager_direct'));
 end if;
end $chk$;

create or replace function public.carwash_manager_close_day(
 p_date date,p_actual_cash numeric,p_terminal_card numeric,
 p_photo_path text default null,p_reason text default null,
 p_confirm_unsynced boolean default false
) returns text language plpgsql security definer set search_path = '' as $fn$
declare
 v_day public.carwash_days%rowtype;
 v_cash numeric(12,2):=0;v_card numeric(12,2):=0;v_count integer:=0;
 v_crew integer:=0;
 v_expenses numeric(12,2):=0;v_payouts numeric(12,2):=0;
 v_movement numeric(12,2):=0;v_expected numeric(12,2):=0;
 v_cash_diff numeric(12,2);v_card_diff numeric(12,2);
 v_unsealed integer:=0;v_has_report boolean:=false;
 v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
 v_proof text:=nullif(trim(coalesce(p_photo_path,'')),'');
begin
 if coalesce(private.current_app_role(),'none') not in ('manager','owner')
   or auth.uid() is null then raise exception 'Manager authorization required';end if;
 if p_date is null or p_date >= (now() at time zone 'Asia/Riyadh')::date
 then raise exception 'Only a completed Riyadh day may be approved';end if;
 if p_actual_cash is null or p_terminal_card is null
    or p_actual_cash<0 or p_terminal_card<0
    or p_actual_cash>10000000 or p_terminal_card>10000000
    or p_actual_cash<>round(p_actual_cash,2)
    or p_terminal_card<>round(p_terminal_card,2)
 then raise exception 'Invalid actual cash or terminal total';end if;
 select * into v_day from public.carwash_days where business_date=p_date for update;
 if not found or v_day.status<>'open' then raise exception 'Day is not open';end if;
 select count(*) into v_unsealed from public.carwash_day_devices
  where business_date=p_date and sealed_at is null;
 if v_unsealed>0 and not coalesce(p_confirm_unsynced,false)
 then raise exception 'Manager must acknowledge unsynced worker devices';end if;
 if v_proof is not null and (
  v_proof not like 'day/'||p_date::text||'/%'
  or not exists(select 1 from storage.objects
   where bucket_id='carwash-pos-evidence' and name=v_proof))
 then raise exception 'Optional POS attachment path is invalid';end if;
 select exists(select 1 from public.carwash_worker_day_reports
  where business_date=p_date) into v_has_report;
 select coalesce(sum(cash_paid),0),coalesce(sum(card_paid),0),count(*)::integer,
  count(*) filter(where car_type in ('سيارة صغيرة','سيارة كبيرة','شاحنة'))::integer
 into v_cash,v_card,v_count,v_crew from public.entries
 where business_date=p_date and deleted_at is null;
 select coalesce(sum(amount),0) into v_expenses from public.expenses x
 where x.deleted_at is null and x.payment_source='cash'
  and coalesce(x.recognition_kind,'operating')<>'salary_accrual'
  and (x.occurred_at at time zone 'Asia/Riyadh')::date=p_date;
 select coalesce(sum(amount),0) into v_payouts from public.worker_ledger l
 where l.deleted_at is null and l.kind='payment' and l.payment_source='cash'
  and l.expense_id is null
  and (l.occurred_at at time zone 'Asia/Riyadh')::date=p_date;
 select coalesce(sum(case when direction='in' then amount else -amount end),0)
 into v_movement from public.carwash_cash_movements
 where business_date=p_date and deleted_at is null;
 v_expected:=v_cash-v_expenses-v_payouts+v_movement;
 v_cash_diff:=p_actual_cash-v_expected;
 v_card_diff:=p_terminal_card-v_card;
 if (v_cash_diff<>0 or v_card_diff<>0 or v_unsealed>0)
    and length(coalesce(v_reason,''))<5
 then raise exception 'Difference or unsynced-device override needs a reason';end if;
 insert into public.carwash_day_settlements(
  business_date,recorded_cash,recorded_card,actual_cash,terminal_card,
  cash_difference,card_difference,cars,collective_tens,
  report_object_path,difference_reason,manager_id,expected_cash,
  cash_expenses,cash_worker_payments,cash_movements_net,
  approval_mode,unsealed_device_override_count,worker_report_present,
  variance_approved_by,variance_approved_at
 ) values(
  p_date,v_cash,v_card,p_actual_cash,p_terminal_card,
  v_cash_diff,v_card_diff,v_count,v_crew*10,
  v_proof,v_reason,auth.uid(),v_expected,
  v_expenses,v_payouts,v_movement,
  'manager_direct',v_unsealed,v_has_report,
  case when v_cash_diff<>0 or v_card_diff<>0 then auth.uid() else null end,
  case when v_cash_diff<>0 or v_card_diff<>0 then now() else null end
 );
 update public.carwash_days set status='approved',
  approved_by=auth.uid(),approved_at=now() where business_date=p_date;
 return 'approved';
end $fn$;

revoke all on function public.carwash_manager_close_day(date,numeric,numeric,text,text,boolean)
 from public,anon,authenticated;
grant execute on function public.carwash_manager_close_day(date,numeric,numeric,text,text,boolean)
 to authenticated;

-- Truck washes also accrue the standard team provision on the old worker-report path.
do $patch$ declare v_sql text;
begin
 select pg_get_functiondef('public.submit_carwash_day_settlement(date,numeric,numeric,text,text)'::regprocedure)
  into v_sql;
 if position('car_type in (''سيارة صغيرة'',''سيارة كبيرة'')' in v_sql)>0 then
  v_sql:=replace(v_sql,
   'car_type in (''سيارة صغيرة'',''سيارة كبيرة'')',
   'car_type in (''سيارة صغيرة'',''سيارة كبيرة'',''شاحنة'')');
  execute v_sql;
 end if;
end $patch$;
