-- Isolated synthetic test only: daily crew accrual and worker handoff.
reset role;
do $qa$
declare d date; m uuid; l uuid; a uuid; b uuid; p text; v numeric; result text; n int;
begin
 select user_id into m from public.app_members where role='manager' and active limit 1;
 if m is null then raise exception 'Missing manager fixture';end if;
 select day::date into d from generate_series(
  date_trunc('month',now() at time zone 'Asia/Riyadh')::date,
  (now() at time zone 'Asia/Riyadh')::date-1,'1 day'::interval) day
 where not exists(select 1 from public.carwash_days x where x.business_date=day::date)
 order by day desc limit 1;
 if d is null then raise exception 'Missing unused finished day fixture';end if;
 perform set_config('request.jwt.claim.sub',m::text,true);
 insert into public.entries(car_type,service_type,cash_paid,card_paid,discount_amount,occurred_at,client_mutation_id,created_by)
 values('سيارة صغيرة','غسيل كامل',25,0,0,(d::timestamp+interval '10 hours') at time zone 'Asia/Riyadh','qa-crew-new-1',m) returning id into a;
 insert into public.entries(car_type,service_type,cash_paid,card_paid,discount_amount,occurred_at,client_mutation_id,created_by)
 values('سيارة كبيرة','غسيل كامل',30,0,0,(d::timestamp+interval '11 hours') at time zone 'Asia/Riyadh','qa-crew-new-2',m) returning id into b;
 select amount into v from public.expenses where crew_business_date=d and deleted_at is null;
 if v is distinct from 20::numeric then raise exception 'Expected daily wage 20, got %',v;end if;
 update public.entries set deleted_at=now() where id=b;
 select amount into v from public.expenses where crew_business_date=d and deleted_at is null;
 if v is distinct from 10::numeric then raise exception 'Expected updated daily wage 10, got %',v;end if;
 select count(*) into n from public.expenses where crew_business_date=d;
 if n<>1 then raise exception 'Duplicate crew expenses';end if;
 insert into public.carwash_worker_links(token_hash,label,created_by,expires_at) values(repeat('9',64),'QA report worker',m,now()+interval '1 day') returning id into l;
 p:='day/'||d::text||'/qa-worker-pos.jpg';
 insert into storage.objects(bucket_id,name) values('carwash-pos-evidence',p);
 if not public.carwash_submit_worker_day_report(d,25,0,0,p,l) then raise exception 'Report not stored';end if;
 if public.carwash_submit_worker_day_report(d,25,0,0,p,l) then raise exception 'Duplicate report accepted';end if;
 result:=public.carwash_approve_worker_report(d,null);
 if result<>'approved' then raise exception 'Worker report not approved: %',result;end if;
 if not exists(select 1 from public.carwash_day_settlements where business_date=d and report_object_path=p) then
  raise exception 'Manager did not use worker evidence';end if;
end $qa$;
select 'DAILY CREW ACCRUAL AND WORKER REPORT END TO END PASSED' as result;
