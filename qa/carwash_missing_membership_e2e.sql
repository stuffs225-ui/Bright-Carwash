-- Synthetic database only. Prove denials happen before any financial lookup.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$
begin
 if private.current_app_role() is distinct from 'none' then
  raise exception 'Missing membership must fail closed';
 end if;
 begin
  perform public.approve_carwash_day_difference('2000-01-01'::date);
  raise exception 'Unauthorized approval returned';
 exception when others then
  if sqlerrm not like '%Owner approval required%' then raise; end if;
 end;
 begin
  perform public.carwash_approve_worker_report('2000-01-01'::date,null);
  raise exception 'Unauthorized worker report approval returned';
 exception when others then
  if sqlerrm not like '%Manager authorization required%' then raise; end if;
 end;
 begin
  perform public.submit_carwash_day_settlement('2000-01-01'::date,0,0,'missing',null);
  raise exception 'Unauthorized settlement returned';
 exception when others then
  if sqlerrm not like '%Manager authorization required%' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 if private.current_app_role() is distinct from 'none' then raise exception 'No JWT must fail closed';end if;
end $$;
rollback;
