-- Stage-only migration: allow encrypted backups to include the private crew
-- payout audit, without granting its table directly to browser clients.
create or replace function public.carwash_backup_crew_payout_audit(
 p_after_id bigint default 0, p_limit integer default 1000
) returns table (
 id bigint,business_date date,previous_cash numeric,previous_bank numeric,
 previous_note text,revised_cash numeric,revised_bank numeric,
 revised_note text,actor_user uuid,changed_at timestamptz
) language sql stable security definer set search_path='' as $function$
 select a.id,a.business_date,a.previous_cash,a.previous_bank,a.previous_note,
  a.revised_cash,a.revised_bank,a.revised_note,a.actor_user,a.changed_at
 from private.carwash_crew_payout_audit a
 where a.id>greatest(p_after_id,0)
 order by a.id
 limit least(greatest(p_limit,1),1000)
$function$;
revoke all on function public.carwash_backup_crew_payout_audit(bigint,integer)
 from public,anon,authenticated;
grant execute on function public.carwash_backup_crew_payout_audit(bigint,integer)
 to service_role;
