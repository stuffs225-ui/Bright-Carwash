-- Document every owner decision during reconciliation; preserve original source rows.
drop trigger if exists audit_change on public.legacy_import_issues;
create trigger audit_change
after insert or update or delete on public.legacy_import_issues
for each row execute function private.audit_row();

-- Revoke direct table DELETE/INSERT for user roles even if another grant is later introduced.
revoke insert, delete on public.legacy_import_issues from anon,authenticated;
revoke insert, update, delete on public.legacy_source_rows from anon,authenticated;

-- Require owner explanations even for direct API calls.
alter table public.legacy_import_issues
add constraint reconciled_requires_reason
check (
 status = 'pending' or
 (length(trim(coalesce(resolution_note,''))) >= 10
  and resolved_at is not null and resolved_by is not null)
);
grant select on public.legacy_import_issues to authenticated;
grant update(status,resolution_note,resolved_at,resolved_by)
 on public.legacy_import_issues to authenticated;
grant select on public.legacy_source_rows to authenticated;

-- Mobile manager may enter an expense for a past accounting month. The
-- effective occurred_at date can differ from the actual input and upload time.
-- created_at remains the server-side insertion time; this is the capture time
-- on the device, used to review delayed uploads and offline reconciliation.
alter table public.expenses
  add column if not exists client_recorded_at timestamptz;
comment on column public.expenses.client_recorded_at is
  'Client capture timestamp; created_at remains the authoritative server receipt timestamp.';
