-- Synthetic-only safety regression. Everything is rolled back.
begin;
do $audit$
declare
 id1 bigint;
 id2 bigint;
begin
 insert into private.carwash_crew_payout_audit(
  business_date,previous_cash,previous_bank,previous_note,
  revised_cash,revised_bank,revised_note,actor_user,changed_at)
 values ('2026-11-14',null,null,null,10,0,'synthetic audit A',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now())
 returning id into id1;
 insert into private.carwash_crew_payout_audit(
  business_date,previous_cash,previous_bank,previous_note,
  revised_cash,revised_bank,revised_note,actor_user,changed_at)
 values ('2026-11-14',10,0,'synthetic audit A',8,2,'synthetic audit B',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now())
 returning id into id2;
 if id2<=id1 then raise exception 'Audit row order invalid';end if;
 if (select count(*) from public.carwash_backup_crew_payout_audit(0,1000)
     where id in (id1,id2))<>2
 then raise exception 'Encrypted backup private audit missing records';end if;
 if (select count(*) from public.carwash_backup_crew_payout_audit(id1,1))<>1
 then raise exception 'Private audit pagination failed';end if;
 if has_function_privilege('anon',
  'public.carwash_backup_crew_payout_audit(bigint,integer)','EXECUTE')
  or has_function_privilege('authenticated',
  'public.carwash_backup_crew_payout_audit(bigint,integer)','EXECUTE')
 then raise exception 'Private backup audit RPC leaked to browsers';end if;
 if not has_function_privilege('service_role',
  'public.carwash_backup_crew_payout_audit(bigint,integer)','EXECUTE')
 then raise exception 'Backup audit RPC unavailable to server';end if;
end $audit$;
rollback;
select 'PRIVATE CREW AUDIT BACKUP / RPC PERMISSIONS PASS' as result;
