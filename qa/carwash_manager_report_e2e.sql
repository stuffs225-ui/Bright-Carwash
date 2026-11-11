-- Synthetic only: manager/worker report parity and no duplicate handoff.
reset role;
do $qa_manager_report$
declare d date; manager_id uuid; image_path text; first_result boolean; second_result boolean; worker_id uuid;
begin
 select user_id into manager_id from public.app_members where role='manager' and active limit 1;
 if manager_id is null then raise exception 'No manager fixture';end if;
 select day::date into d from generate_series(
  date_trunc('month',now() at time zone 'Asia/Riyadh')::date,
  (now() at time zone 'Asia/Riyadh')::date-1,'1 day'::interval) day
 where not exists(select 1 from public.carwash_days x where x.business_date=day::date)
 order by day desc limit 1;
 if d is null then raise exception 'No free finished synthetic business day';end if;
 perform set_config('request.jwt.claim.sub',manager_id::text,true);
 insert into public.entries(car_type,service_type,cash_paid,card_paid,discount_amount,
   occurred_at,client_mutation_id,created_by)
 values('سيارة صغيرة','غسيل كامل',25,0,0,
   (d::timestamp+interval '12 hours') at time zone 'Asia/Riyadh',
   'qa-manager-report-entry',manager_id);
 image_path:='day/'||d::text||'/qa-manager-report.png';
 insert into storage.objects(bucket_id,name) values('carwash-pos-evidence',image_path);
 first_result:=public.carwash_submit_manager_day_report(d,25,0,0,image_path,manager_id);
 if first_result is distinct from true then raise exception 'Manager report failed';end if;
 second_result:=public.carwash_submit_manager_day_report(d,25,0,0,image_path,manager_id);
 if second_result is distinct from false then raise exception 'Manager report duplicated';end if;
 select worker_link_id into worker_id from public.carwash_worker_day_reports where business_date=d;
 if worker_id is not null or not exists (
  select 1 from public.carwash_worker_day_reports where business_date=d
   and manager_user_id=manager_id and report_object_path=image_path
 ) then raise exception 'Manager provenance or image path missing';end if;
 if has_function_privilege('anon',
   'public.carwash_submit_manager_day_report(date,numeric,numeric,numeric,text,uuid)','EXECUTE')
 or has_function_privilege('authenticated',
   'public.carwash_submit_manager_day_report(date,numeric,numeric,numeric,text,uuid)','EXECUTE')
 then raise exception 'Unsafe manager report function grant';end if;
end $qa_manager_report$;
reset role;
select 'MANAGER REPORT PARITY AND IDEMPOTENCY PASSED' as result;
