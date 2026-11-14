-- Synthetic-only validation; this file is executed against ephemeral PostgreSQL.
begin;
do $crew_qa$
declare
 m uuid;
 a uuid;
 b uuid;
 v_due numeric;
 v_result jsonb;
 v_count integer;
 v_refused boolean:=false;
begin
 select user_id into m from public.app_members where role='manager' and active limit 1;
 if m is null then raise exception 'Manager fixture missing';end if;
 perform set_config('request.jwt.claim.sub',m::text,true);
 insert into public.entries(car_type,service_type,cash_paid,card_paid,discount_amount,
   occurred_at,client_mutation_id,created_by)
 values('سيارة صغيرة','غسيل كامل',25,0,0,
   '2026-11-14 10:00:00+03','qa-crew-policy-small-20261114',m) returning id into a;
 insert into public.entries(car_type,service_type,cash_paid,card_paid,discount_amount,
   occurred_at,client_mutation_id,created_by)
 values('شاحنة','غسيل كامل',0,55,0,
   '2026-11-14 10:01:00+03','qa-crew-policy-truck-20261114',m) returning id into b;
 select amount into v_due from public.expenses
  where crew_business_date=date '2026-11-14' and deleted_at is null;
 if v_due is distinct from 20 then
  raise exception 'Truck and small car should accrue 20, got %',v_due;end if;
 v_result:=public.carwash_record_crew_payout(date '2026-11-14',8,12,'Manager split cash and bank');
 if v_result->>'remaining'<>'0' and (v_result->>'remaining')::numeric<>0 then
  raise exception 'Unexpected team payout remainder';end if;
 if (select count(*) from public.carwash_crew_payouts where business_date='2026-11-14')<>1
 then raise exception 'Team payout should have exactly one record';end if;
 v_result:=public.carwash_record_crew_payout(date '2026-11-14',8,12,'Manager split cash and bank');
 select count(*) into v_count from private.carwash_crew_payout_audit
 where business_date='2026-11-14';
 if v_count<>1 then raise exception 'Idempotent payout generated extra audit';end if;
 v_result:=public.carwash_record_crew_payout(date '2026-11-14',10,10,'Corrected split cash and bank');
 select count(*) into v_count from private.carwash_crew_payout_audit
 where business_date='2026-11-14';
 if v_count<>2 then raise exception 'Payout correction was not audited';end if;
 begin
  perform public.carwash_record_crew_payout(date '2026-11-14',11,10,'Exceeds daily due');
 exception when others then
  if position('exceeds accrued' in sqlerrm)>0 then v_refused:=true;
  else raise;end if;
 end;
 if not v_refused then raise exception 'Excess team payout was accepted';end if;
 v_refused:=false;
 begin
  perform public.carwash_record_crew_payout(date '2026-11-13',5,0,'Cannot edit closed day');
 exception when others then v_refused:=true;end;
 if not v_refused then raise exception 'Historic/closed day crew payout accepted';end if;
 if exists(select 1 from public.expenses
  where crew_business_date='2026-11-14' and deleted_at is null
  group by crew_business_date having count(*)>1)
 then raise exception 'Duplicate crew salary expense';end if;
end $crew_qa$;
rollback;
select 'OWNER-APPROVED TRUCK ACCRUAL AND TEAM PAYOUT POLICY PASSED' as result;
