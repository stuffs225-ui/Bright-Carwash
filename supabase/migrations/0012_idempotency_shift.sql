-- Idempotent offline replay and explicit operational shift settings.
alter table public.entries add column if not exists client_mutation_id text;
alter table public.expenses add column if not exists client_mutation_id text;
create unique index if not exists entries_client_mutation_unique
  on public.entries(client_mutation_id) where client_mutation_id is not null;
create unique index if not exists expenses_client_mutation_unique
  on public.expenses(client_mutation_id) where client_mutation_id is not null;
insert into public.settings(key,value) values
 ('shift_start_hour','15'), ('shift_end_hour','4')
on conflict (key) do nothing;
