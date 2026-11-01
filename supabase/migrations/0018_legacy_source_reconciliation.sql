-- Zero-loss source preservation for the original Google Sheets data.
-- Any record incompatible with current financial constraints is quarantined
-- for explicit reconciliation, NEVER silently discarded or guessed.
create table if not exists public.legacy_source_rows (
 id bigint generated always as identity primary key,
 source_sheet text not null,
 source_row integer not null check (source_row >= 2),
 raw_values jsonb not null,
 imported_at timestamptz not null default now(),
 unique (source_sheet,source_row)
);
create index if not exists legacy_source_rows_sheet_idx on public.legacy_source_rows(source_sheet,source_row);
alter table public.legacy_source_rows enable row level security;
create policy owner_read_legacy_source on public.legacy_source_rows
 for select to authenticated using (private.current_app_role() = 'owner');

create table if not exists public.legacy_import_issues (
 id bigint generated always as identity primary key,
 source_sheet text not null,
 source_row integer not null check (source_row >= 2),
 issue_code text not null,
 details jsonb not null default '{}'::jsonb,
 status text not null default 'pending' check(status in ('pending','resolved','waived')),
 resolution_note text,
 resolved_at timestamptz,
 resolved_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(source_sheet,source_row,issue_code)
);
create index if not exists legacy_import_issues_status_idx on public.legacy_import_issues(status,source_sheet);
alter table public.legacy_import_issues enable row level security;
create policy lead_read_legacy_issues on public.legacy_import_issues
 for select to authenticated using (private.current_app_role() in ('owner','manager'));
create policy owner_update_legacy_issues on public.legacy_import_issues
 for update to authenticated using (private.current_app_role() = 'owner')
 with check (private.current_app_role() = 'owner');
-- Service-role migration writes bypass RLS. User roles cannot insert fake source exceptions.
