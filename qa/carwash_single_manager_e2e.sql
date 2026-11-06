-- Sole manager, shared worker E2E. Fake accounts only.
-- Runs after 0021 is applied to disposable PostgreSQL. Nothing is
-- applied to a user's Supabase project by GitHub CI.
do $qa_role_conversion$
declare n_owner integer;n_manager integer;
begin
 select count(*) into n_owner from public.app_members where role='owner';
 select count(*) into n_manager from public.app_members where role='manager' and active;
 if n_owner<>0 or n_manager<1 then
 raise exception 'Only manager/worker roles may remain, owners %, managers %',n_owner,n_manager;
 end if;
end
$qa_role_conversion$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

-- Existing SQL owner-only financial operations must now work for manager.
do $qa_manager_months$
begin
 if private.current_app_role()<>'owner' then
  raise exception 'Internal manager permission alias not applied';
 end if;
 perform public.approve_carwash_month('2025-08');
 perform public.reopen_carwash_month('2025-08','Manager audit correction for backdated expense');
end
$qa_manager_months$;

-- Authenticated clients cannot elevate their own membership by REST queries.
do $qa_no_member_role_escalation$
declare denied boolean:=false;
begin
 begin
  update public.app_members set role='worker'
  where user_id='22222222-2222-4222-8222-222222222222';
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'Manager can overwrite app_members directly';end if;
end
$qa_no_member_role_escalation$;

reset role;
do $qa_two_roles_only$
declare rejected boolean:=false;
begin
 begin
  insert into public.app_members(user_id,role,active)
  values('33333333-3333-4333-8333-333333333333','owner',true);
 exception when check_violation or unique_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Old owner role inserted after manager consolidation';end if;
end
$qa_two_roles_only$;

select 'SINGLE MANAGER AND SHARED WORKER E2E PASSED' as test_result;
