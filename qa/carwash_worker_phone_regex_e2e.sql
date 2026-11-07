-- Non-destructive role and phone-format gate for the applied migration.
do $qa$
declare pattern text;
begin
 select (regexp_match(p.prosrc,$capture$p_customer_phone !~ '([^']+)'$capture$))[1]
 into pattern
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='carwash_worker_link_record';
 if pattern is null then raise exception 'Worker phone validation expression missing';end if;
 if not ('+966512345678' ~ pattern) then
  raise exception 'A valid Saudi customer phone is rejected';end if;
 if ('+966412345678' ~ pattern) or ('+96651234567' ~ pattern) or
    ('966512345678' ~ pattern) then
  raise exception 'Invalid Saudi customer phone incorrectly accepted';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='carwash_worker_link_record'
   and (has_function_privilege('anon',p.oid,'EXECUTE') or
        has_function_privilege('authenticated',p.oid,'EXECUTE') or
        not has_function_privilege('service_role',p.oid,'EXECUTE'))) then
  raise exception 'Scoped worker function execute privilege changed';end if;
end $qa$;
