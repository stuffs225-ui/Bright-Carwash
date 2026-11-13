-- Targeted synthetic acceptance: manager closes a past business day without a
-- worker report or photo. Entire fixture is rolled back; production never used.
begin;
insert into auth.users(id,phone) values
 ('88888888-8888-4888-8888-888888888888','+966500000088');
insert into public.app_members(user_id,role,active)
 values('88888888-8888-4888-8888-888888888888','manager',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
do $qa$ declare denied boolean:=false;begin
 begin
  perform public.carwash_manager_close_day('2026-01-16',25,0);
 exception when others then denied:=true;
 end;
 if not denied then raise exception 'Non-member bypassed direct day close';end if;
end $qa$;
reset role;
select set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
insert into public.entries(
 car_type,service_type,cash_paid,card_paid,discount_amount,
 occurred_at,client_mutation_id,created_by
) values('سيارة صغيرة','غسيل كامل',25,0,0,
 '2026-01-16 12:00:00+03'::timestamptz,
 'qa-direct-close-2026-01-16','88888888-8888-4888-8888-888888888888');
set local role authenticated;
do $qa$
declare decision text;car_id uuid;denied boolean:=false;
begin
 -- The database must reject any manager approval when one car is not delivered.
 begin
  perform public.carwash_manager_close_day('2026-01-16',25,0,null,null,false);
 exception when others then
  if position('تسليم' in sqlerrm)=0 then raise;end if;
  denied:=true;
 end;
 if not denied then raise exception 'An undelivered car was incorrectly approved';end if;
 select id into car_id from public.entries where client_mutation_id='qa-direct-close-2026-01-16';
 if car_id is null then raise exception 'Synthetic car missing';end if;
 -- Delivery works immediately from washing without a prior ready tap.
 perform public.carwash_readiness_action(
  car_id,'delivered','manager','88888888-8888-4888-8888-888888888888',null,null);
 if not exists(select 1 from public.carwash_entry_readiness where entry_id=car_id and status='delivered')
 then raise exception 'Direct delivery from washing did not complete';end if;
 decision:=public.carwash_manager_close_day('2026-01-16',25,0,null,null,false);
 if decision<>'approved' or
   not exists(select 1 from public.carwash_days
    where business_date='2026-01-16' and status='approved') or
   not exists(select 1 from public.carwash_day_settlements
    where business_date='2026-01-16' and approval_mode='manager_direct'
     and report_object_path is null and worker_report_present=false
     and recorded_cash=25 and actual_cash=25)
 then raise exception 'Manager without worker handoff or photo could not close day';end if;
end $qa$;
reset role;
rollback;
select 'TARGETED DIRECT MANAGER CLOSE AND AUTHORIZATION PASSED' as result;
