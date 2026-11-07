-- Append-only audit trail for automated private readiness-photo retention.
-- No existing image is deleted by this migration.
create table if not exists public.carwash_photo_cleanup_log(
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null references public.entries(id) on delete restrict,
 object_path text not null,
 reason text not null default 'configured_retention',
 deleted_at timestamptz not null default now()
);
alter table public.carwash_photo_cleanup_log enable row level security;
create index if not exists carwash_photo_cleanup_log_entry_idx
 on public.carwash_photo_cleanup_log(entry_id,deleted_at);
revoke all on public.carwash_photo_cleanup_log from anon;
grant select on public.carwash_photo_cleanup_log to authenticated;
create policy carwash_manager_photo_cleanup_read on public.carwash_photo_cleanup_log
 for select to authenticated using(private.current_app_role()='owner');
