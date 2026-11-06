-- Applied to Supabase qsobrjtfyofmjeswktvb as migration 20261106195149.
-- Independent manager PIN verifier: never overwrite the email password.
create table if not exists public.carwash_manager_pin_verifiers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_verifier text not null check (pin_verifier ~ '^[0-9a-f]{64}$'),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.carwash_manager_pin_verifiers enable row level security;
revoke all on public.carwash_manager_pin_verifiers from PUBLIC, anon, authenticated;
grant select, insert, update, delete on public.carwash_manager_pin_verifiers to service_role;
drop policy if exists carwash_manager_pin_service_role_only on public.carwash_manager_pin_verifiers;
create policy carwash_manager_pin_service_role_only
  on public.carwash_manager_pin_verifiers
  for all to service_role using (true) with check (true);
comment on table public.carwash_manager_pin_verifiers is
 'Private service-role-only peppered manager PIN verifier; email Auth password and worker PIN unaffected.';
