-- A worker link was previously stored only as its SHA-256 hash. That is
-- intentionally irreversible. Newly issued links get a manager-recoverable,
-- authenticated AES-GCM ciphertext while the original hash remains the
-- only token used to validate worker requests.
alter table public.carwash_worker_links
 add column if not exists encrypted_token text;
alter table public.carwash_worker_links
 add constraint carwash_worker_link_cipher_format
 check (encrypted_token is null or
        encrypted_token ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]{86}$');

-- Only the server's service-role client can issue/reissue links.
-- Under one transaction, the existing link is revoked only if the newly
-- issued encrypted link is also inserted successfully.
create or replace function public.carwash_issue_saved_worker_link(
 p_manager uuid,
 p_token_hash text,
 p_encrypted_token text,
 p_label text,
 p_expires_at timestamptz,
 p_replace boolean default false
) returns uuid language plpgsql security invoker set search_path='' as $fn$
declare
 v_active int;
 v_id uuid;
begin
 if p_manager is null or not exists (
  select 1 from public.app_members m
  where m.user_id=p_manager and m.role='manager' and m.active=true
 ) then raise exception 'Manager account is not active'; end if;
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
  or p_encrypted_token is null
  or p_encrypted_token !~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]{86}$'
  or p_label is null or length(trim(p_label)) not between 1 and 80
  or p_expires_at <= now() or p_expires_at > now()+interval '91 days'
 then raise exception 'Invalid worker link request';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_manager::text,981247));
 select count(*) into v_active from public.carwash_worker_links
  where created_by=p_manager and revoked_at is null and expires_at>now();
 if v_active>0 and not p_replace then raise exception 'Active worker link exists';end if;
 if v_active>0 then
  update public.carwash_worker_links
   set revoked_at=now()
   where created_by=p_manager and revoked_at is null and expires_at>now();
 end if;
 insert into public.carwash_worker_links(token_hash,encrypted_token,label,created_by,expires_at,daily_limit)
  values(p_token_hash,p_encrypted_token,trim(p_label),p_manager,p_expires_at,250)
  returning id into v_id;
 return v_id;
end $fn$;
revoke all on function public.carwash_issue_saved_worker_link(uuid,text,text,text,timestamptz,boolean)
 from public,anon,authenticated;
grant execute on function public.carwash_issue_saved_worker_link(uuid,text,text,text,timestamptz,boolean)
 to service_role;
