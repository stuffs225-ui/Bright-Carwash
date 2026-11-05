-- End-to-end synthetic PostgreSQL coverage: migrations, RLS, worker device,
-- collective SAR10, discounts, POS proof, manager approval, reset, owner variance.
-- 100% fake UUIDs, fake phone numbers, fake POS image metadata.

insert into auth.users(id,phone) values
 ('11111111-1111-4111-8111-111111111111','+966500000001'),
 ('22222222-2222-4222-8222-222222222222','+966500000002'),
 ('33333333-3333-4333-8333-333333333333','+966500000003');
insert into public.app_members(user_id,role,active) values
 ('11111111-1111-4111-8111-111111111111','worker',true),
 ('22222222-2222-4222-8222-222222222222','manager',true),
 ('33333333-3333-4333-8333-333333333333','owner',true);
insert into public.carwash_addons(id,name,price,active)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','تعطير',5,true);

select set_config('qa.shift_id',
 (select id::text from public.carwash_shifts where status='open'),false);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.register_carwash_device(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 current_setting('qa.shift_id')::uuid
);
insert into public.entries(
 car_type,service_type,cash_paid,card_paid,discount_amount,shift_id,device_id,
 client_mutation_id,customer_phone,sms_consent
) values (
 'سيارة صغيرة','غسيل كامل',15,0,10,
 current_setting('qa.shift_id')::uuid,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'carwash-synthetic-1','+966500000004',true
);

do $$
declare count_visible int; blocked boolean:=false;
begin
 select count(*) into count_visible from public.entries;
 if count_visible<>1 then raise exception 'Worker must see current shared-account entry, saw %',count_visible;end if;
 begin
  insert into public.entries(
   car_type,service_type,cash_paid,card_paid,discount_amount,
   shift_id,device_id,client_mutation_id
  ) values (
   'سيارة كبيرة','غسيل كامل',30,0,11,
   current_setting('qa.shift_id')::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
   'carwash-over-discount'
  );
 exception when others then blocked:=true;
 end;
 if not blocked then raise exception 'Worker could bypass SAR10 discount cap';end if;
end $;

-- A valid catalog add-on increases the fixed price by SAR 5,
-- while forged arbitrary worker prices must be rejected server-side.
insert into public.entries(
 car_type,service_type,cash_paid,card_paid,discount_amount,
 shift_id,device_id,client_mutation_id,addon_ids
) values(
 'سيارة صغيرة','غسيل كامل',30,0,0,
 current_setting('qa.shift_id')::uuid,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'carwash-valid-extra','["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"]'::jsonb
);
do $carwash_price_e2e$
declare blocked boolean:=false; valid_addon_total numeric;
begin
 select addon_total into valid_addon_total from public.entries
  where client_mutation_id='carwash-valid-extra';
 if valid_addon_total<>5 then raise exception 'Server add-on price incorrect';end if;
 begin
  insert into public.entries(
   car_type,service_type,cash_paid,card_paid,discount_amount,
   shift_id,device_id,client_mutation_id
  ) values(
   'سيارة صغيرة','غسيل كامل',1,0,0,
   current_setting('qa.shift_id')::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
   'carwash-forged-price'
  );
 exception when others then blocked:=true;
 end;
 if not blocked then raise exception 'Worker bypassed fixed service tariff';end if;
end
$carwash_price_e2e$;

reset role;
insert into storage.objects(bucket_id,name)
values('carwash-pos-evidence', current_setting('qa.shift_id')||'/pos.jpg');

-- Manager must not approve while a staff device is unsealed.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare blocked boolean:=false;
begin
 begin
  perform public.submit_carwash_shift_settlement(
    current_setting('qa.shift_id')::uuid,45,0,current_setting('qa.shift_id')||'/pos.jpg',null);
 exception when others then blocked:=true;
 end;
 if not blocked then raise exception 'Manager approved unsealed staff shift';end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.seal_carwash_device(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 current_setting('qa.shift_id')::uuid
);

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare status_out text;
begin
 status_out := public.submit_carwash_shift_settlement(
  current_setting('qa.shift_id')::uuid,45,0,current_setting('qa.shift_id')||'/pos.jpg',null
 );
 if status_out<>'approved' then raise exception 'Expected exact balance approval, got %',status_out;end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare visible int; newly_open int;
begin
 select count(*) into visible from public.entries;
 if visible<>0 then raise exception 'Worker can still read approved old shift records: %',visible;end if;
 select count(*) into newly_open from public.carwash_shifts where status='open';
 if newly_open<>1 then raise exception 'New shift not created exactly once: %',newly_open;end if;
end $$;

reset role;
select set_config('qa.shift2',
 (select id::text from public.carwash_shifts where status='open'),false);
insert into storage.objects(bucket_id,name)
values('carwash-pos-evidence', current_setting('qa.shift2')||'/pos2.jpg');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.register_carwash_device(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 current_setting('qa.shift2')::uuid
);
insert into public.entries(
 car_type,service_type,cash_paid,card_paid,discount_amount,shift_id,device_id,
 client_mutation_id
) values(
 'سيارة كبيرة','غسيل كامل',30,0,0,
 current_setting('qa.shift2')::uuid,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'carwash-synthetic-2'
);
select public.seal_carwash_device(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 current_setting('qa.shift2')::uuid
);

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare status_out text;
begin
 status_out:=public.submit_carwash_shift_settlement(
  current_setting('qa.shift2')::uuid,25,0,
  current_setting('qa.shift2')||'/pos2.jpg','5 SAR shortage recorded'
 );
 if status_out<>'awaiting_owner' then raise exception 'Expected owner approval route';end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$declare visible int;begin
 select count(*) into visible from public.entries;
 if visible<>1 then raise exception 'Pending owner approval must retain worker session';end if;
end $$;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select public.approve_carwash_shift_variance(current_setting('qa.shift2')::uuid);
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$declare visible int;begin
 select count(*) into visible from public.entries;
 if visible<>0 then raise exception 'Owner approval must reset worker visible session';end if;
end $$;

-- Monthly accounting adjustments require owner reopening and version history.
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select public.approve_carwash_month('2025-10');
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare blocked boolean:=false;
begin
 begin
  insert into public.expenses(expense_type,amount,occurred_at)
  values('اخرى',15,'2025-10-15 12:00:00+03'::timestamptz);
 exception when others then blocked:=true;
 end;
 if not blocked then raise exception 'Backdated expense bypassed approved-month guard';end if;
end $$;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select (public.reopen_carwash_month('2025-10','Late vendor expense for October')).status;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.expenses(expense_type,amount,occurred_at)
values('اخرى',15,'2025-10-15 12:00:00+03'::timestamptz);
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select (public.approve_carwash_month('2025-10')).version;
do $$declare n int;begin
 select count(*) into n from public.accounting_month_report_versions
 where month_id=(select id from public.accounting_months where period='2025-10');
 if n<>2 then raise exception 'Accounting month did not preserve both approved versions: %',n;end if;
end $$;
reset role;

do $$
declare c int;ac int;
begin
 select count(*) into c from public.carwash_shifts where status='approved';
 if c<>2 then raise exception 'Expected two archived approved shifts, got %',c;end if;
 select count(*) into ac from public.audit_events;
 if ac<8 then raise exception 'Financial audit trail incomplete: %',ac;end if;
end $$;
select 'CARWASH POSTGRES E2E SMOKE PASSED' as test_result;
