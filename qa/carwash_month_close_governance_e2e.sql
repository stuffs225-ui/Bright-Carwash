-- Synthetic isolated PostgreSQL test only. No production data is changed.
-- A manager must NOT approve an accounting month with an open or
-- manager-pending Riyadh day, even if all month figures were imported.
select set_config('qa.month_guard_day',
 (date_trunc('month',now() at time zone 'Asia/Riyadh')::date - 1)::text,false);
reset role;
insert into public.carwash_days(business_date,status)
 values(current_setting('qa.month_guard_day')::date,'open')
 on conflict(business_date) do update set status='open';
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $qa_month_guard$
declare v_blocked boolean:=false;v_period text;
begin
 v_period:=to_char(current_setting('qa.month_guard_day')::date,'YYYY-MM');
 begin
  perform public.approve_carwash_month(v_period);
 exception when others then
  if position('unapproved business days' in SQLERRM)>0 then
   v_blocked:=true;
  else
   raise;
  end if;
 end;
 if not v_blocked then
  raise exception 'Open Riyadh business day did not prevent monthly approval';
 end if;
end $qa_month_guard$;
reset role;
update public.carwash_days set status='approved',approved_at=now()
 where business_date=current_setting('qa.month_guard_day')::date;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $qa_month_can_approve_after_close$
declare v_period text;v_status text;
begin
 v_period:=to_char(current_setting('qa.month_guard_day')::date,'YYYY-MM');
 perform public.approve_carwash_month(v_period);
 select status into v_status from public.accounting_months where period=v_period;
 if v_status<>'approved' then
  raise exception 'Closed month was not approved after all operational days closed';
 end if;
end $qa_month_can_approve_after_close$;
reset role;
select 'MONTH CLOSE REQUIRES ALL DAYS SETTLED' as test_result;
