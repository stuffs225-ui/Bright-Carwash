-- Preserve source evidence for financial reconciliation, not just derived totals.
-- Standard UNIQUE indexes allow onConflict=legacy_ref in idempotent upsert.
drop index if exists public.entries_legacy_ref_unique;
drop index if exists public.expenses_legacy_ref_unique;
create unique index entries_legacy_ref_unique on public.entries(legacy_ref);
create unique index expenses_legacy_ref_unique on public.expenses(legacy_ref);

alter table public.entries add column if not exists legacy_reported_total numeric(10,2);
alter table public.entries add column if not exists legacy_amount_mismatch boolean not null default false;
alter table public.workers add column if not exists worker_type text
  not null default 'worker' check(worker_type in ('worker','team'));
alter table public.workers add column if not exists hourly_rate numeric(10,2)
  not null default 0 check(hourly_rate >= 0);
