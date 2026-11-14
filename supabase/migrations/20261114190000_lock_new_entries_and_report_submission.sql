-- Only newly-created records are affected; historical amounts and approvals are untouched.
-- Service-role archival imports remain unaffected by authenticated-client RLS.
alter policy staff_insert_carwash_with_discount_limit on public.entries
with check (
 private.current_app_role() in ('owner','manager','worker')
 and created_by = (select auth.uid())
 and legacy_ref is null
 and discount_amount = 0
);

-- An incoming daily report must never precede the last vehicle handover.
create or replace function private.require_all_delivered_before_report_insert()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare pending_cars integer;
begin
 perform 1 from public.carwash_days
  where business_date=new.business_date and status='open' for update;
 if not found then raise exception 'Day is not open';end if;
 select count(*) into pending_cars from public.entries e
 left join public.carwash_entry_readiness r on r.entry_id=e.id
 where e.business_date=new.business_date and e.deleted_at is null
  and coalesce(r.status,'washing')<>'delivered';
 if pending_cars>0 then
  raise exception 'All cars must be delivered before day report (% pending)',pending_cars;
 end if;
 return new;
end $fn$;

drop trigger if exists carwash_report_requires_all_delivered on public.carwash_worker_day_reports;
create trigger carwash_report_requires_all_delivered
before insert on public.carwash_worker_day_reports
for each row execute function private.require_all_delivered_before_report_insert();
