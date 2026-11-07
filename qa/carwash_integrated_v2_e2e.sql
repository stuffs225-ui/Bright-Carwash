-- Synthetic-only finance + exception + ready-state E2E.
-- Does not access or modify the connected live Supabase project.
reset role;
insert into public.carwash_worker_links(token_hash,label,created_by,expires_at,daily_limit)
 values(repeat('e',64),'QA synthetic worker','22222222-2222-4222-8222-222222222222',
   now()+interval '30 days',250)
on conflict do nothing;
do $qa_custom_and_readiness$
declare v_link uuid;v_first jsonb;v_again jsonb;v_entry uuid;v_extras jsonb;v_extra_id uuid;
 v_lines integer;v_total numeric;v_status text;v_denied boolean:=false;
begin
 select id into v_link from public.carwash_worker_links where token_hash=repeat('e',64);
 if v_link is null then raise exception 'Synthetic worker link missing';end if;
 v_first:=public.carwash_worker_link_record_exception(
  repeat('e',64),'سيارة صغيرة','غسيل ماكينة',40,'[]'::jsonb,'[]'::jsonb,
  15,25,0,'QA exception','مصادقة اختبار السعر',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'+966500000008',true);
 v_again:=public.carwash_worker_link_record_exception(
  repeat('e',64),'سيارة صغيرة','غسيل ماكينة',40,'[]'::jsonb,'[]'::jsonb,
  15,25,0,'QA exception','مصادقة اختبار السعر',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'+966500000008',true);
 if coalesce((v_again->>'duplicate')::boolean,false)<>true
  or (v_first->>'id')<>(v_again->>'id')
 then raise exception 'Worker exception retry wrote a duplicate car';end if;
 v_entry:=(v_first->>'id')::uuid;
 select count(*),sum(amount) into v_lines,v_total
 from public.carwash_entry_line_items where entry_id=v_entry;
 if v_lines<>1 or v_total<>40 then
  raise exception 'Exception base price was not saved as immutable line item';end if;
 -- Independent 2nd car with a custom one-time add-on and mixed cash/card.
 v_extras:=public.carwash_worker_link_record_exception(
  repeat('e',64),'سيارة كبيرة','غسيل داخلي خاص',35,
  '[{"name":"واكس خاص","price":12.50}]'::jsonb,'[]'::jsonb,
  20,27.50,0,'mixed QA','عمل إضافي مستقل',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef'::uuid,null,false);
 v_extra_id:=(v_extras->>'id')::uuid;
 select count(*),sum(amount) into v_lines,v_total
 from public.carwash_entry_line_items where entry_id=v_extra_id;
 if v_lines<>2 or v_total<>47.50 then
  raise exception 'Custom add-on line-price snapshot failed';end if;
 if (select count(*) from public.entry_presets where service_type='غسيل داخلي خاص')<>0
 then raise exception 'One-time price mutated permanent catalog';end if;

 insert into storage.objects(bucket_id,name)
  values('carwash-ready-photos','active/'||v_entry::text||'/qa-photo.jpg');
 perform public.carwash_readiness_action(v_entry,'photo_uploaded','worker',null,v_link,
  'active/'||v_entry::text||'/qa-photo.jpg');
 if not exists(select 1 from public.carwash_readiness_events
   where entry_id=v_entry and event_type='photo_uploaded') then
  raise exception 'Private car image audit was not recorded';end if;
  perform public.carwash_readiness_action(v_entry,'ready','worker',null,v_link,null);
 perform public.carwash_readiness_action(v_entry,'share_opened','worker',null,v_link,null);
 perform public.carwash_readiness_action(v_entry,'delivered','worker',null,v_link,null);
 select status into v_status from public.carwash_entry_readiness where entry_id=v_entry;
 if v_status<>'delivered' then raise exception 'Worker car readiness chain failed';end if;
 begin
  perform public.carwash_readiness_action(v_entry,'ready','worker',null,v_link,null);
 exception when others then v_denied:=true;end;
 if not v_denied then raise exception 'Delivered car was reopened';end if;
end $qa_custom_and_readiness$;

-- Test salary recognition/payments and actual cash balance on a free past day.
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select set_config('qa.finance_day',((now() at time zone 'Asia/Riyadh')::date-4)::text,false);
insert into public.workers(id,name,sort_order,worker_type,hourly_rate)
 values('aaaaeeee-eeee-4eee-8eee-eeeeeeeeeeee','QA dummy worker',991,'worker',10);
insert into public.entries(car_type,service_type,cash_paid,card_paid,
 occurred_at,created_by,client_mutation_id)
values('سيارة صغيرة','غسيل كامل',40,0,
 ((current_setting('qa.finance_day')||' 12:00:00')::timestamp at time zone 'Asia/Riyadh'),
 '22222222-2222-4222-8222-222222222222','synthetic-cash-settlement');
insert into public.expenses(expense_type,amount,notes,occurred_at,created_by,
 payment_source,recognition_kind,client_mutation_id)
values('مواد استهلاكية',10,'synthetic cash soap',
 ((current_setting('qa.finance_day')||' 12:30:00')::timestamp at time zone 'Asia/Riyadh'),
 '22222222-2222-4222-8222-222222222222','cash','operating','qa-cash-soap');
insert into public.worker_ledger(worker_id,kind,amount,occurred_at,notes)
values('aaaaeeee-eeee-4eee-8eee-eeeeeeeeeeee','earning',15,
 ((current_setting('qa.finance_day')||' 13:00:00')::timestamp at time zone 'Asia/Riyadh'),'synthetic accrued wage');
insert into public.worker_ledger(worker_id,kind,amount,payment_source,occurred_at,notes)
values('aaaaeeee-eeee-4eee-8eee-eeeeeeeeeeee','payment',5,'cash',
 ((current_setting('qa.finance_day')||' 13:15:00')::timestamp at time zone 'Asia/Riyadh'),'synthetic cash payout');
insert into public.carwash_cash_movements(business_date,direction,amount,reason,created_by)
values(current_setting('qa.finance_day')::date,'out',3,'synthetic bank deposit',
 '22222222-2222-4222-8222-222222222222');
do $qa_accrual_once$
declare v_count int;v_earned numeric;v_paid numeric;
begin
 select count(*) into v_count from public.expenses where source_ledger_id in
  (select id from public.worker_ledger where worker_id='aaaaeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 select sum(amount) into v_earned from public.expenses
 where source_ledger_id is not null and expense_type='راتب'
  and salary_worker_id='aaaaeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 select sum(amount) into v_paid from public.worker_ledger
 where worker_id='aaaaeeee-eeee-4eee-8eee-eeeeeeeeeeee' and kind='payment';
 if v_count<>1 or v_earned<>15 or v_paid<>5
 then raise exception 'Salary accrual or cash payment was double counted';end if;
end $qa_accrual_once$;
reset role;
-- Prior synthetic workers enrolled devices for many test dates.
-- This fixture explicitly marks only its own test-day devices as synchronized.
update public.carwash_day_devices set sealed_at=now()
 where business_date=current_setting('qa.finance_day')::date and sealed_at is null;
insert into storage.objects(bucket_id,name)
 values('carwash-pos-evidence','day/'||current_setting('qa.finance_day')||'/qa-settlement.jpg');
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.submit_carwash_day_settlement(
 current_setting('qa.finance_day')::date,22,0,
 'day/'||current_setting('qa.finance_day')||'/qa-settlement.jpg',null);
do $qa_cash_balance$
declare v_cash numeric;v_expected numeric;v_paid numeric;v_expenses numeric;v_net numeric;v_diff numeric;
begin
 select recorded_cash,expected_cash,cash_worker_payments,cash_expenses,cash_movements_net,cash_difference
 into v_cash,v_expected,v_paid,v_expenses,v_net,v_diff
 from public.carwash_day_settlements
 where business_date=current_setting('qa.finance_day')::date;
 if v_cash<>40 or v_expected<>22 or v_paid<>5
  or v_expenses<>10 or v_net<>-3 or v_diff<>0
 then raise exception 'Actual cash formula wrong %,%,%,%,%,%',
   v_cash,v_expected,v_paid,v_expenses,v_net,v_diff;end if;
end $qa_cash_balance$;
reset role;
-- Member ACL: staff account cannot read manager-only car photos and contact metadata.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $qa_worker_no_direct_read$
declare v_visible integer;v_can_call boolean:=false;
begin
 select count(*) into v_visible from public.carwash_entry_readiness;
 if v_visible<>0 then raise exception 'Worker bypassed readiness RLS';end if;
 begin
  perform public.carwash_readiness_action(
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
   'ready','worker',null,null,null);
  v_can_call:=true;
 exception when insufficient_privilege then null;
 end;
 if v_can_call then raise exception 'Authenticated worker invoked service-only readiness RPC';end if;
end $qa_worker_no_direct_read$;
reset role;
select 'CARWASH EXCEPTION + READINESS + FINANCE + RLS E2E PASSED' as result;
