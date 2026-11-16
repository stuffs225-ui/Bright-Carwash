-- Independent synthetic review of exposed SECURITY DEFINER functions.
-- The existence of an authenticated grant is not itself an exploit; every
-- business RPC must enforce the app role, and anon has no definer access.
begin;
do $security$
declare proc record;
declare body text;
declare reviewed integer:=0;
begin
 for proc in select p.oid,p.proname from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
 loop
  if has_function_privilege('anon',proc.oid,'EXECUTE')
  then raise exception 'Anon can call privileged function %',proc.proname;end if;
  if has_function_privilege('authenticated',proc.oid,'EXECUTE') then
   body:=pg_get_functiondef(proc.oid);
   if position('private.current_app_role' in body)=0
   then raise exception 'Authenticated privileged RPC lacks app role guard: %',proc.proname;end if;
   reviewed:=reviewed+1;
  end if;
 end loop;
 if reviewed<10 then raise exception 'Unexpected privileged business API surface: %',reviewed;end if;
 if has_function_privilege('authenticated',
  'public.carwash_backup_crew_payout_audit(bigint,integer)','EXECUTE')
 then raise exception 'Private backup RPC exposed to browser';end if;
end $security$;
rollback;
select 'PRIVILEGED RPC ROLE GATES AND ANON REVOCATIONS PASS' as result;
