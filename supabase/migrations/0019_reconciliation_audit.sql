-- Document every owner decision during reconciliation; preserve original source rows.
drop trigger if exists audit_change on public.legacy_import_issues;
create trigger audit_change
after insert or update or delete on public.legacy_import_issues
for each row execute function private.audit_row();

-- Revoke direct table DELETE/INSERT for user roles even if another grant is later introduced.
revoke insert, delete on public.legacy_import_issues from anon,authenticated;
revoke insert, update, delete on public.legacy_source_rows from anon,authenticated;
