-- Synthetic only: this entire authorization/replacement test rolls back.
begin;
do $owner$
declare manager uuid; old_hash text:=repeat('a',64);new_hash text:=repeat('b',64);
 old_cipher text:='v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',86);
 new_cipher text:='v1.'||repeat('D',16)||'.'||repeat('E',22)||'.'||repeat('F',86);
 answer text;
begin
 select user_id into manager from public.app_members
  where role='manager' and active limit 1;
 if manager is null then raise exception 'No synthetic manager found';end if;
 answer:=public.carwash_issue_saved_owner_link(manager,old_hash,old_cipher,false);
 if answer<>old_hash then raise exception 'First owner link not saved';end if;
 answer:=public.carwash_issue_saved_owner_link(manager,new_hash,new_cipher,false);
 if answer<>old_hash then raise exception 'Repeated request created a new manager link';end if;
 if not exists(select 1 from public.carwash_owner_activation_links
  where owner_user_id=manager and token_hash=old_hash and encrypted_token=old_cipher
  and used_at is null)
 then raise exception 'Owner link not recoverable';end if;
 answer:=public.carwash_issue_saved_owner_link(manager,new_hash,new_cipher,true);
 if answer<>new_hash then raise exception 'Owner link replacement failed';end if;
 if exists(select 1 from public.carwash_owner_activation_links
  where token_hash=old_hash and used_at is null)
 then raise exception 'Replaced manager link remains valid';end if;
 if not exists(select 1 from public.carwash_owner_activation_links
  where token_hash=new_hash and used_at is null)
 then raise exception 'Replacement link was revoked unexpectedly';end if;
 if has_function_privilege('anon','public.carwash_issue_saved_owner_link(uuid,text,text,boolean)','EXECUTE')
 or has_function_privilege('authenticated','public.carwash_issue_saved_owner_link(uuid,text,text,boolean)','EXECUTE')
 then raise exception 'Manager link issuance RPC exposed to ordinary clients';end if;
 if has_table_privilege('anon','public.carwash_owner_activation_links','SELECT')
 or has_table_privilege('authenticated','public.carwash_owner_activation_links','SELECT')
 then raise exception 'Stored manager URL hashes exposed to clients';end if;
end $owner$;
rollback;
select 'RECOVERABLE OWNER LINK / ATOMIC REPLACEMENT / PRIVILEGES PASS' as result;
