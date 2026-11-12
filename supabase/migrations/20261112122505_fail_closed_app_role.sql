-- Missing/inactive membership must be a denied role, not SQL NULL.
-- NULL NOT IN (...) is NULL, which does not enter a PL/pgSQL rejection IF.
-- Keep the existing manager -> owner compatibility and login experience.
-- No financial rows, dates, or membership records are modified.
create or replace function private.current_app_role()
returns text language sql stable security definer set search_path='' as $$
 select coalesce((
  select case when m.role='manager' then 'owner' else m.role end
  from public.app_members m
  where m.user_id=(select auth.uid()) and m.active=true limit 1
 ),'none')
$$;
