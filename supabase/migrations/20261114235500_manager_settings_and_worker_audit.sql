-- Manager self-service settings: allow only currently implemented operational controls.
-- No financial snapshots, historic cars, payroll transactions or owner-only secrets are changed.
create policy manager_self_service_settings_read on public.settings
 for select to authenticated
 using (private.current_app_role()='manager' and key in (
  'daily_expense_target','worker_manual_service_enabled',
  'whatsapp_ready_text','ready_photo_retention_days'
 ));
create policy manager_self_service_settings_insert on public.settings
 for insert to authenticated
 with check (private.current_app_role()='manager' and key in (
  'daily_expense_target','worker_manual_service_enabled',
  'whatsapp_ready_text','ready_photo_retention_days'
 ));
create policy manager_self_service_settings_update on public.settings
 for update to authenticated
 using (private.current_app_role()='manager' and key in (
  'daily_expense_target','worker_manual_service_enabled',
  'whatsapp_ready_text','ready_photo_retention_days'
 ))
 with check (private.current_app_role()='manager' and key in (
  'daily_expense_target','worker_manual_service_enabled',
  'whatsapp_ready_text','ready_photo_retention_days'
 ));

-- Prevent client-side hard deletion even when the manager is treated as
-- owner by the existing single-manager role compatibility policy.
-- Service-role imports remain capable of explicit maintenance when authorized.
revoke delete on table public.workers from anon,authenticated;

-- Employee changes use soft archival (workers.active=false). Never delete
-- history, accrued costs or linked ledger entries.
create trigger carwash_worker_profile_audit
 after insert or update on public.workers for each row
 execute function private.audit_row();

-- Settings lack a UUID id, so use their stable key for the same audit log.
create or replace function private.carwash_audit_operating_setting()
returns trigger language plpgsql security definer set search_path='' as $audit$
begin
 if TG_OP='INSERT' or OLD.value is distinct from NEW.value then
  insert into public.audit_events(table_name,row_id,action,actor_id,before_row,after_row)
  values ('settings',NEW.key,TG_OP,auth.uid(),
   case when TG_OP='INSERT' then null else to_jsonb(OLD) end,to_jsonb(NEW));
 end if;
 return NEW;
end $audit$;
revoke all on function private.carwash_audit_operating_setting()
 from public,anon,authenticated;
create trigger carwash_operating_setting_audit
 after insert or update on public.settings for each row
 execute function private.carwash_audit_operating_setting();
