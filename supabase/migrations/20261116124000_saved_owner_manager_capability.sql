-- Keep the manager's one-tap high-entropy URL encrypted and retrievable
-- from the already authenticated settings page. NEVER grant browser access.
alter table public.carwash_owner_activation_links
 add column if not exists encrypted_token text;
create index if not exists carwash_owner_active_links_recent
 on public.carwash_owner_activation_links(owner_user_id,created_at desc)
 where used_at is null;
create or replace function public.carwash_issue_saved_owner_link(
 p_owner uuid,p_token_hash text,p_encrypted_token text,p_replace boolean default false
) returns text
language plpgsql security definer set search_path='' as $function$
declare
 v_current text;
begin
 if p_owner is null or p_token_hash !~ '^[a-f0-9]{64}$' or
  p_encrypted_token !~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]{86}$'
 then raise exception 'Invalid owner recovery link';end if;
 if not exists(select 1 from public.app_members m
  where m.user_id=p_owner and m.role='manager' and m.active)
 then raise exception 'Manager role required';end if;
 -- Concurrent requests from two devices must not create two active saved URLs.
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,20261116));
 select token_hash into v_current from public.carwash_owner_activation_links
 where owner_user_id=p_owner and used_at is null and expires_at>now()
  and encrypted_token is not null
 order by created_at desc limit 1;
 if v_current is not null and not p_replace then return v_current;end if;
 insert into public.carwash_owner_activation_links(
  token_hash,owner_user_id,expires_at,encrypted_token
 )values(p_token_hash,p_owner,'2099-01-01T00:00:00Z',p_encrypted_token);
 if p_replace then
  update public.carwash_owner_activation_links set used_at=now()
  where owner_user_id=p_owner and token_hash<>p_token_hash and used_at is null;
 end if;
 return p_token_hash;
end $function$;
revoke all on function public.carwash_issue_saved_owner_link(uuid,text,text,boolean)
 from public,anon,authenticated;
grant execute on function public.carwash_issue_saved_owner_link(uuid,text,text,boolean)
 to service_role;
