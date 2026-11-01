-- Error logs are operationally sensitive: no anonymous inserts or employee-wide reads.
alter table public.error_log enable row level security;
drop policy if exists "anyone can insert error_log" on public.error_log;
drop policy if exists "authenticated read error_log" on public.error_log;
create policy staff_log_errors on public.error_log for insert to authenticated
with check (private.current_app_role() in ('owner','manager','worker'));
create policy owner_view_errors on public.error_log for select to authenticated
using (private.current_app_role() = 'owner');
