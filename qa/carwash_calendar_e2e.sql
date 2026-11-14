-- Isolated Bright-Carwash, fake authenticated users from legacy test.
select set_config('qa.today',((now() at time zone 'Asia/Riyadh')::date)::text,false);
select set_config('qa.yesterday',(((now() at time zone 'Asia/Riyadh')::date)-1)::text,false);
select set_config('qa.before_yesterday',(((now() at time zone 'Asia/Riyadh')::date)-2)::text,false);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.enroll_carwash_worker_device('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select public.enroll_carwash_worker_device('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- At 23:59:59 KSA, records belong to yesterday; at midnight to today.
insert into public.entries(car_type,service_type,cash_paid,card_paid,discount_amount,
 device_id,client_mutation_id,occurred_at)
values
('سيارة صغيرة','غسيل كامل',25,0,0,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'calendar-prev',((current_setting('qa.yesterday')||' 23:59:59')::timestamp at time zone 'Asia/Riyadh')),
('سيارة كبيرة','غسيل كامل',0,30,0,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'calendar-new',((current_setting('qa.today')||' 00:00:00')::timestamp at time zone 'Asia/Riyadh'));
do $qa_midnight$
declare n_old int;n_today int;n_visible int;ndev int;
begin
 select count(*) into n_old from public.entries where client_mutation_id='calendar-prev'
 and business_date=current_setting('qa.yesterday')::date;
 select count(*) into n_today from public.entries where client_mutation_id='calendar-new'
 and business_date=current_setting('qa.today')::date;
 select count(*) into n_visible from public.entries where client_mutation_id like 'calendar-%';
 select count(*) into ndev from public.carwash_day_devices
 where business_date=current_setting('qa.yesterday')::date;
 if n_old<>1 or n_today<>1 or n_visible<>2 or ndev<>2 then
 raise exception 'Midnight or multi-day open history failed %,%,%,%',n_old,n_today,n_visible,ndev;end if;
end
$qa_midnight$;
reset role;
insert into storage.objects(bucket_id,name)
 values('carwash-pos-evidence','day/'||current_setting('qa.yesterday')||'/statement.jpg'),
 ('carwash-pos-evidence','day/'||current_setting('qa.today')||'/statement.jpg');
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $qa_block_today$
declare blocked boolean:=false;
begin
 begin perform public.submit_carwash_day_settlement(current_setting('qa.today')::date,0,30,
 'day/'||current_setting('qa.today')||'/statement.jpg',null);
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Unfinished today was closed';end if;
end
$qa_block_today$;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.seal_carwash_business_day(current_setting('qa.yesterday')::date,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $qa_second_device$
declare blocked boolean:=false;
begin
 begin perform public.submit_carwash_day_settlement(current_setting('qa.yesterday')::date,25,0,
 'day/'||current_setting('qa.yesterday')||'/statement.jpg',null);
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Closed a day with a second device unsealed';end if;
end
$qa_second_device$;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.seal_carwash_business_day(current_setting('qa.yesterday')::date,
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
-- New database-level close policy: even after all devices are sealed, cars must be delivered.
-- Exercise the real readiness RPC with a synthetic manager before approving.
reset role;
do $qa_deliver_yesterday$
declare car_id uuid;
begin
 select id into car_id from public.entries where client_mutation_id='calendar-prev';
 perform public.carwash_readiness_action(
  car_id,'delivered','manager','22222222-2222-4222-8222-222222222222',null,null);
 if not exists(select 1 from public.carwash_entry_readiness where entry_id=car_id and status='delivered')
 then raise exception 'Previous day car did not transition directly from washing to delivered';end if;
end
$qa_deliver_yesterday$;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select public.submit_carwash_day_settlement(current_setting('qa.yesterday')::date,25,0,
 'day/'||current_setting('qa.yesterday')||'/statement.jpg',null);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $qa_only_approved_hides$
declare n_old int;n_new int;
begin
 select count(*) into n_old from public.entries where client_mutation_id='calendar-prev';
 select count(*) into n_new from public.entries where client_mutation_id='calendar-new';
 if n_old<>0 or n_new<>1 then raise exception 'Approved yesterday should disappear; today should still appear';end if;
end
$qa_only_approved_hides$;
-- Approved old date does not impede registering a second car on current date.
insert into public.entries(car_type,service_type,cash_paid,card_paid,discount_amount,
 device_id,client_mutation_id,occurred_at)
values('سيارة صغيرة','غسيل كامل',25,0,0,
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','calendar-new-second',now());

-- Previous unapproved date also appears until its own separate approval.
insert into public.entries(car_type,service_type,cash_paid,card_paid,discount_amount,
 device_id,client_mutation_id,occurred_at)
values('سيارة صغيرة','غسيل كامل',25,0,0,
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','calendar-before',
((current_setting('qa.before_yesterday')||' 15:00:00')::timestamp at time zone 'Asia/Riyadh'));
select public.seal_carwash_business_day(current_setting('qa.before_yesterday')::date,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select public.seal_carwash_business_day(current_setting('qa.before_yesterday')::date,
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
reset role;
insert into storage.objects(bucket_id,name)
values('carwash-pos-evidence','day/'||current_setting('qa.before_yesterday')||'/difference.jpg');
do $qa_deliver_before_yesterday$
declare car_id uuid;
begin
 select id into car_id from public.entries where client_mutation_id='calendar-before';
 perform public.carwash_readiness_action(
  car_id,'delivered','manager','22222222-2222-4222-8222-222222222222',null,null);
 if not exists(select 1 from public.carwash_entry_readiness where entry_id=car_id and status='delivered')
 then raise exception 'Historical synthetic car must be delivered before settlement';end if;
end
$qa_deliver_before_yesterday$;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select public.submit_carwash_day_settlement(current_setting('qa.before_yesterday')::date,20,0,
 'day/'||current_setting('qa.before_yesterday')||'/difference.jpg','5 SAR shortage');
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $qa_pending_stays$
declare n int;
begin
 select count(*) into n from public.entries where client_mutation_id='calendar-before';
 if n<>1 then raise exception 'Owner-pending day disappeared prematurely';end if;
end
$qa_pending_stays$;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select public.approve_carwash_day_difference(current_setting('qa.before_yesterday')::date);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $qa_own_date_reset$
declare n_old int;n_today int;
begin
 select count(*) into n_old from public.entries where client_mutation_id='calendar-before';
 select count(*) into n_today from public.entries where client_mutation_id like 'calendar-new%';
 if n_old<>0 or n_today<>2 then raise exception 'Owner approval must hide only approved day';end if;
end
$qa_own_date_reset$;
reset role;
-- Worker phone must be a single shared active account, not one per employee.
insert into auth.users(id,phone)
values('44444444-4444-4444-8444-444444444444','+966500000044');
do $qa_single_worker_phone$
declare rejected boolean:=false;
begin
 begin
  insert into public.app_members(user_id,role,active)
  values('44444444-4444-4444-8444-444444444444','worker',true);
 exception when unique_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Multiple active shared worker phone accounts accepted';end if;
end
$qa_single_worker_phone$;
select 'CALENDAR DAY END-TO-END PASSED' as test_result;
