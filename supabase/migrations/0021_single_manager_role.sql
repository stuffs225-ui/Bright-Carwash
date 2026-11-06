-- Bright-Carwash-only operational role consolidation (2026-11-06).
-- Customer approved exactly TWO visible roles: Manager + shared Worker.
-- Historic 'owner' membership rows are migrated to 'manager' without
-- deleting users or altering financial rows/audit provenance.
-- No database is touched by creating this checked-in migration.
begin;

update public.app_members set role='manager' where role='owner';

alter table public.app_members drop constraint if exists app_members_role_check;
alter table public.app_members add constraint app_members_role_check
 check(role in('manager','worker'));

-- Legacy privileged SQL functions and policies check 'owner'. Map the
-- single privileged manager role to that existing internal SQL permission
-- label while keeping the persisted role/phone API exactly 'manager'.
-- This ensures manager can approve differences, reopen approved months,
-- inspect audit history, adjust settings, and run financial reconciliation.
create or replace function private.current_app_role()
returns text language sql stable security definer set search_path=''
as $carwash_effective_manager$
 select case when m.role='manager' then 'owner' else m.role end
 from public.app_members m
 where m.user_id=(select auth.uid()) and m.active=true limit 1
$carwash_effective_manager$;
revoke all on function private.current_app_role() from public;
grant execute on function private.current_app_role() to authenticated;

-- Crucial: privileged manager must never be allowed to create their own
-- membership/role directly through the REST API. All membership writes are
-- confined to the server-only admin API (service_role, never NEXT_PUBLIC).
-- RLS policies remain in place as additional defense in depth.
revoke insert,update,delete on table public.app_members
 from PUBLIC,anon,authenticated;
grant select on table public.app_members to authenticated;

-- Readable explicit label for current privilege alias.
comment on function private.current_app_role() is
 'Carwash sole manager is internally mapped to legacy owner SQL permissions. Stored roles remain manager or worker; app_members writes are server-only.';

commit;
