-- Synthetic-only manager settings + worker soft-archive authorization tests.
-- No production data is used; transaction rolls back.
begin;
insert into auth.users(id,phone) values
 ('99999999-9999-4999-8999-999999999981','+966500000081');
insert into public.app_members(user_id,role,active) values
 ('99999999-9999-4999-8999-999999999981','manager',true);
insert into public.settings(key,value) values('backup_email','"owner-only@example.invalid"'::jsonb)
 on conflict(key) do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999981',true);
do $qa$
declare v_worker uuid;v_rows int;v_error boolean:=false;
begin
 insert into public.workers(name,worker_type,hourly_rate,sort_order,notes)
 values('Synthetic worker to rename','worker',0,99,'Initial notes')
 returning id into v_worker;
 insert into public.worker_ledger(worker_id,kind,amount,notes)
 values(v_worker,'earning',100,'Synthetic accrued wage');
 update public.workers set name='Synthetic renamed worker',
   hourly_rate=12.50,notes='Renamed from settings',active=false,
   phone='+966500000000',job_title='Team attendant',joined_on=date '2026-11-01'
 where id=v_worker;
 if not exists(select 1 from public.workers
  where id=v_worker and name='Synthetic renamed worker' and active=false
  and hourly_rate=12.50 and phone='+966500000000'
  and job_title='Team attendant' and joined_on=date '2026-11-01') then
  raise exception 'Manager could not rename/archive a worker';
 end if;
 if (select count(*) from public.worker_ledger
  where worker_id=v_worker and deleted_at is null)<>1 then
  raise exception 'Archiving deleted the workers historical financial ledger';
 end if;
 begin
  delete from public.workers where id=v_worker;
  get diagnostics v_rows=row_count;
 exception when foreign_key_violation or insufficient_privilege then
  v_rows:=0; -- The historic salary/ledger FK also prevents hard deletion.
 end;
 if v_rows<>0 or not exists(select 1 from public.workers where id=v_worker)
 then raise exception 'Hard deletion altered the worker or linked history';end if;
 update public.workers set active=true where id=v_worker;
 if not exists(select 1 from public.workers where id=v_worker and active)
 then raise exception 'Worker restore failed';end if;
 insert into public.settings(key,value)
 values('worker_manual_service_enabled','true'::jsonb)
 on conflict(key) do update set value=excluded.value;
 if not exists(select 1 from public.settings
  where key='worker_manual_service_enabled' and value='true'::jsonb)
 then raise exception 'Manager settings insertion/read failed';end if;
 update public.settings set value='false'::jsonb where key='worker_manual_service_enabled';
 if not exists(select 1 from public.settings
  where key='worker_manual_service_enabled' and value='false'::jsonb)
 then raise exception 'Manager settings update failed';end if;
 -- Existing app policy intentionally treats the single manager as owner.
 -- It may edit broad settings, but a worker must never gain that access.
 update public.settings set value='"manager-can-manage-settings"'::jsonb where key='backup_email';
 get diagnostics v_rows=row_count;
 if v_rows<>1 then raise exception 'Single manager owner-equivalent settings access regressed';end if;
end $qa$;
reset role;
-- The app intentionally has only one active shared worker account.
-- Reuse its synthetic fixture rather than creating a prohibited second account.
set local role authenticated;
select set_config('request.jwt.claim.sub',
 (select user_id::text from public.app_members where role='worker' and active limit 1),true);
do $worker_denial$
declare n int; denied boolean:=false;
begin
 if (select count(*) from public.workers)<>0
 then raise exception 'Shared worker could read the private employee directory';end if;
 update public.settings set value='"worker-bypass"'::jsonb where key='backup_email';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Worker updated private settings';end if;
 begin
  insert into public.settings(key,value) values('worker_unapproved_test','true'::jsonb);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Worker inserted forbidden settings';end if;
end $worker_denial$;
reset role;
do $audit$
begin
 if not exists(select 1 from public.audit_events
   where table_name='workers' and action='UPDATE'
   and actor_id='99999999-9999-4999-8999-999999999981'
   and after_row->>'name'='Synthetic renamed worker')
 then raise exception 'Worker rename was not audited';end if;
 if not exists(select 1 from public.audit_events
   where table_name='settings' and row_id='worker_manual_service_enabled'
   and actor_id='99999999-9999-4999-8999-999999999981'
   and after_row->>'value'='false')
 then raise exception 'Manager setting change was not audited';end if;
end $audit$;
rollback;
select 'MANAGER WORKER CRUD, ARCHIVE, SETTINGS RLS AND AUDIT PASSED' as result;
