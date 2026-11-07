-- Snapshot extends existing report without changing transaction totals or past versions.
CREATE OR REPLACE FUNCTION public.approve_carwash_month(p_period text)
 RETURNS accounting_months
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if exists(
  select 1 from public.carwash_days d
  where d.business_date >= (p_period || '-01')::date
    and d.business_date < ((p_period || '-01')::date + interval '1 month')::date
    and d.status <> 'approved'
 ) then
  raise exception 'Cannot approve accounting month while unapproved business days exist';
 end if;

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
    where car_type in ('سيارة صغيرة','سيارة كبيرة') and occurred_at >=v_start and occurred_at <v_end and deleted_at is null),
  'crew_extra_bonuses',coalesce((select sum(amount) from public.crew_shift_bonuses
    where shift_date >= (p_period || '-01')::date
      and shift_date < ((p_period || '-01')::date + interval '1 month')::date
      and deleted_at is null),0),
  'expenses',coalesce((select sum(amount) from public.expenses
    where occurred_at >=v_start and occurred_at <v_end and deleted_at is null),0),
  'captured_at',now()
 ) into v_snapshot;
 v_snapshot:=v_snapshot||jsonb_build_object(
  'recognized_operating_result',
  coalesce((select sum(cash_paid+card_paid) from public.entries
    where occurred_at>=v_start and occurred_at<v_end and deleted_at is null),0)
   -coalesce((select sum(amount) from public.expenses
    where occurred_at>=v_start and occurred_at<v_end and deleted_at is null),0),
  'salary_expenses',
   coalesce((select sum(amount) from public.expenses where expense_type='راتب'
    and occurred_at>=v_start and occurred_at<v_end and deleted_at is null),0),
  'cash_operating_expenses',
   coalesce((select sum(amount) from public.expenses where payment_source='cash'
    and coalesce(recognition_kind,'operating')<>'salary_accrual'
    and occurred_at>=v_start and occurred_at<v_end and deleted_at is null),0),
  'cash_worker_payouts',
   coalesce((select sum(amount) from public.worker_ledger where kind='payment'
    and payment_source='cash' and occurred_at>=v_start and occurred_at<v_end
    and deleted_at is null and expense_id is null),0),
  'cash_difference',
   coalesce((select sum(cash_difference) from public.carwash_day_settlements
    where business_date >=(p_period||'-01')::date and
      business_date<((p_period||'-01')::date+interval '1 month')::date),0),
  'card_difference',
   coalesce((select sum(card_difference) from public.carwash_day_settlements
    where business_date >=(p_period||'-01')::date and
      business_date<((p_period||'-01')::date+interval '1 month')::date),0),
  'imported_undated_cars',
   (select count(*) from public.entries where occurred_at>=v_start
    and occurred_at<v_end and deleted_at is null and business_date is null),
  'snapshot_policy','recorded_revenue_less_recorded_expenses'
 );

 update public.accounting_months
 set status='approved',version=v.version+1,
     approved_at=now(),approved_by=(select auth.uid()),updated_at=now()
 where id=v.id returning * into v;

 insert into public.accounting_month_report_versions(month_id,version,snapshot,approved_by)
 values(v.id,v.version,v_snapshot,(select auth.uid()));
 return v;
end $function$

