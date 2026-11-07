-- Atomic daily settlement uses the cash actually expected after same-day payments.
-- No changes to existing settlements or imported financial records.
CREATE OR REPLACE FUNCTION public.submit_carwash_day_settlement(p_date date, p_actual_cash numeric, p_terminal_card numeric, p_report_path text, p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_day public.carwash_days%rowtype;v_cash numeric(12,2);
 v_card numeric(12,2);v_count integer;v_cash_diff numeric(12,2);
 v_card_diff numeric(12,2);v_today date;
 v_crew_count integer;
 v_cash_expenses numeric(12,2):=0;
 v_cash_worker_payments numeric(12,2):=0;
 v_cash_movements_net numeric(12,2):=0;
 v_expected_cash numeric(12,2):=0;
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
 select coalesce(sum(cash_paid),0),coalesce(sum(card_paid),0),count(*)::integer,
 count(*) filter(where car_type in ('سيارة صغيرة','سيارة كبيرة'))::integer
 into v_cash,v_card,v_count,v_crew_count from public.entries
 where business_date=p_date and deleted_at is null;
 -- Recorded cash is not necessarily cash still in the till.
 -- Posted cash expenses and staff payouts reduce expected cash; transfers adjust it.
 select coalesce(sum(x.amount),0) into v_cash_expenses from public.expenses x
 where x.deleted_at is null and x.payment_source='cash'
  and coalesce(x.recognition_kind,'operating')<>'salary_accrual'
  and (x.occurred_at at time zone 'Asia/Riyadh')::date=p_date;
 select coalesce(sum(l.amount),0) into v_cash_worker_payments from public.worker_ledger l
 where l.deleted_at is null and l.kind='payment' and l.payment_source='cash'
  and l.expense_id is null
  and (l.occurred_at at time zone 'Asia/Riyadh')::date=p_date;
 select coalesce(sum(case when direction='in' then amount else -amount end),0)
 into v_cash_movements_net from public.carwash_cash_movements
 where business_date=p_date and deleted_at is null;
 v_expected_cash:=v_cash-v_cash_expenses-v_cash_worker_payments+v_cash_movements_net;
 v_cash_diff:=p_actual_cash-v_expected_cash;
 v_card_diff:=p_terminal_card-v_card;
 if (v_cash_diff<>0 or v_card_diff<>0) and
 length(trim(coalesce(p_reason,'')))<5 then
  raise exception 'Variance requires a written reason and owner review';end if;
 insert into public.carwash_day_settlements(
 business_date,recorded_cash,recorded_card,actual_cash,terminal_card,
 cash_difference,card_difference,cars,collective_tens,
 report_object_path,difference_reason,manager_id,
 expected_cash,cash_expenses,cash_worker_payments,cash_movements_net
 ) values(p_date,v_cash,v_card,p_actual_cash,p_terminal_card,
 v_cash_diff,v_card_diff,v_count,v_crew_count*10,p_report_path,
 nullif(trim(coalesce(p_reason,'')),''),(select auth.uid()),
 v_expected_cash,v_cash_expenses,v_cash_worker_payments,v_cash_movements_net);
 if v_cash_diff<>0 or v_card_diff<>0 then
  update public.carwash_days set status='awaiting_owner' where business_date=p_date;
  return 'awaiting_owner';
 end if;
 update public.carwash_days set status='approved',approved_at=now(),
 approved_by=(select auth.uid()) where business_date=p_date;
 return 'approved';
end
$function$

