-- Fully synthetic and rolled back: no live link is replaced or revoked.
begin;
do $qa$
declare
 m uuid;
 old_id uuid;
 new_id uuid;
 refused boolean:=false;
 v_cipher text:='v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',86);
begin
 select user_id into m from public.app_members where role='manager' and active limit 1;
 if m is null then raise exception 'Synthetic manager account missing';end if;
 insert into public.carwash_worker_links
  (token_hash,label,created_by,expires_at,daily_limit)
 values(repeat('a',64),'Legacy shared link',m,now()+interval '90 days',250)
 returning id into old_id;
 begin
  perform public.carwash_issue_saved_worker_link(m,repeat('b',64),v_cipher,
   'New saved link',now()+interval '90 days',false);
 exception when others then
  if position('Active worker link exists' in sqlerrm)>0 then refused:=true;
  else raise;end if;
 end;
 if not refused then raise exception 'Existing worker link was replaced without consent';end if;
 if exists(select 1 from public.carwash_worker_links where id=old_id and revoked_at is not null)
 then raise exception 'Failed issuance revoked the old link';end if;
 new_id:=public.carwash_issue_saved_worker_link(m,repeat('b',64),v_cipher,
   'New saved link',now()+interval '90 days',true);
 if new_id is null or
  not exists(select 1 from public.carwash_worker_links where id=old_id and revoked_at is not null) or
  not exists(select 1 from public.carwash_worker_links where id=new_id and revoked_at is null
   and encrypted_token=v_cipher) then
  raise exception 'Explicit replacement did not issue saved link atomically';end if;
 if (select count(*) from public.carwash_worker_links
  where created_by=m and revoked_at is null and expires_at>now())<>1 then
  raise exception 'More than one active link remained after replacement';end if;
 if has_function_privilege('anon','public.carwash_issue_saved_worker_link(uuid,text,text,text,timestamptz,boolean)','EXECUTE')
  or has_function_privilege('authenticated','public.carwash_issue_saved_worker_link(uuid,text,text,text,timestamptz,boolean)','EXECUTE')
  or not has_function_privilege('service_role','public.carwash_issue_saved_worker_link(uuid,text,text,text,timestamptz,boolean)','EXECUTE')
 then raise exception 'Server-only link issue RPC privilege mismatch';end if;
 if has_table_privilege('authenticated','public.carwash_worker_links','SELECT')
 then raise exception 'Worker link ciphertext leaked to authenticated client';end if;
end $qa$;
rollback;
select 'WORKER LINK VAULT ROTATION AND PRIVILEGES PASSED' as result;
