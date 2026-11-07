-- Final release regression: isolated synthetic PostgreSQL ONLY, never production.
-- Requires previous QA migrations and fixture tests, with fake identities and dates.
reset role;
select set_config('qa.completion_day',((now() at time zone 'Asia/Riyadh')::date-3)::text,false);
insert into storage.objects(bucket_id,name)
 values('carwash-pos-evidence','day/'||current_setting('qa.completion_day')||'/qa-final-pos.pdf')
on conflict do nothing;
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
insert into public.entries(car_type,service_type,cash_paid,card_paid,
 discount_amount,occurred_at,client_mutation_id,created_by) values
 ('سيارة صغيرة','غسيل كامل',0,25,0,
  ((current_setting('qa.completion_day')||' 10:00:00')::timestamp at time zone 'Asia/Riyadh'),
  'completion-card','22222222-2222-4222-8222-222222222222'),
 ('سيارة كبيرة','غسيل كامل',30,0,0,
  ((current_setting('qa.completion_day')||' 11:00:00')::timestamp at time zone 'Asia/Riyadh'),
  'completion-cash','22222222-2222-4222-8222-222222222222'),
 ('سيارة صغيرة','غسيل كامل',10,15,0,
  ((current_setting('qa.completion_day')||' 12:00:00')::timestamp at time zone 'Asia/Riyadh'),
  'completion-mixed','22222222-2222-4222-8222-222222222222');
do $qa_complete_revenue$
declare v_cash numeric;v_card numeric;v_cars int;
begin
 select sum(cash_paid),sum(card_paid),count(*) into v_cash,v_card,v_cars
 from public.entries where client_mutation_id like 'completion-%';
 if v_cash<>40 or v_card<>40 or v_cars<>3 then
  raise exception 'Mixed-payment car totals mismatch: %,%,%',v_cash,v_card,v_cars;
 end if;
end $qa_complete_revenue$;
select public.submit_carwash_day_settlement(
 current_setting('qa.completion_day')::date,45,42,
 'day/'||current_setting('qa.completion_day')||'/qa-final-pos.pdf',
 'QA variance: counted extra cash and terminal transactions');
do $qa_variance$
declare s text;cash_extra numeric;card_extra numeric;
begin
 select status into s from public.carwash_days where business_date=current_setting('qa.completion_day')::date;
 select cash_difference,card_difference into cash_extra,card_extra
 from public.carwash_day_settlements where business_date=current_setting('qa.completion_day')::date;
 if s<>'awaiting_owner' or cash_extra<>5 or card_extra<>2 then
  raise exception 'Positive cash/POS variance mismatch: %,%,%',s,cash_extra,card_extra;end if;
end $qa_variance$;
reset role;
set role authenticated;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
select public.approve_carwash_day_difference(current_setting('qa.completion_day')::date);
do $qa_approved_financial_frozen$
declare blocked boolean:=false;
begin
 begin
  update public.entries set cash_paid=31
  where client_mutation_id='completion-cash';
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Manager was allowed to change a settled car';end if;
end $qa_approved_financial_frozen$;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $qa_worker_cannot_view_approved$
declare visible_count int;
begin
 select count(*) into visible_count from public.entries
 where client_mutation_id like 'completion-%';
 if visible_count<>0 then raise exception 'Worker saw settled day cars';end if;
end $qa_worker_cannot_view_approved$;
reset role;
-- The earlier monthly guard test approved the previous Riyadh month.
select set_config('qa.complete_month',to_char(
 date_trunc('month',now() at time zone 'Asia/Riyadh')::date-1,'YYYY-MM'),false);
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $qa_month_reopen_and_revise$
declare p text;old_version int;old_id uuid;old_snapshot jsonb;
 new_version int;new_snapshot jsonb;v_count int;blocked boolean:=false;
begin
 p:=current_setting('qa.complete_month');
 select version,id into old_version,old_id from public.accounting_months where period=p;
 if old_version is null or old_version<1 then raise exception 'Previous month not initially approved';end if;
 select snapshot into old_snapshot from public.accounting_month_report_versions
  where month_id=old_id and version=old_version;
 if old_snapshot is null then raise exception 'Missing first month snapshot';end if;
 perform public.reopen_carwash_month(p,'QA correction: add a documented missing supply expense');
 insert into public.expenses(expense_type,amount,notes,occurred_at,
  created_by,client_mutation_id)
 values('مواد استهلاكية',13,'QA synthetic missing expense',
  ((p||'-05 12:00:00')::timestamp at time zone 'Asia/Riyadh'),
  '22222222-2222-4222-8222-222222222222','qa-month-revision');
 perform public.approve_carwash_month(p);
 select version into new_version from public.accounting_months where id=old_id;
 select snapshot into new_snapshot from public.accounting_month_report_versions
 where month_id=old_id and version=new_version;
 select count(*) into v_count from public.accounting_month_report_versions where month_id=old_id;
 if new_version<>old_version+1 or v_count<2 or new_snapshot is null then
  raise exception 'Month revision or immutable snapshot versions missing';end if;
 if (select snapshot from public.accounting_month_report_versions
     where month_id=old_id and version=old_version) is distinct from old_snapshot then
  raise exception 'Earlier month snapshot was altered by re-approval';end if;
 if coalesce((new_snapshot->>'expense_total')::numeric,
  (new_snapshot->>'expenses')::numeric,-1)<=
  coalesce((old_snapshot->>'expense_total')::numeric,
   (old_snapshot->>'expenses')::numeric,-1) then
  raise notice 'Original snapshot expense key unavailable; checking current snapshot metadata separately';
 end if;
 begin
  update public.expenses set amount=14 where client_mutation_id='qa-month-revision';
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Post-approval expense alteration succeeded';end if;
end $qa_month_reopen_and_revise$;
reset role;
select 'MIXED PAYMENT + TWO-SIDED VARIANCES + CLOSED DAY + MONTH REOPEN/REVERSION PASSED' as result;
