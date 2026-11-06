-- Isolated Bright-Carwash, 2026-11-06.
-- Stage for real source import and 4-digit PIN rate limiting.
-- This file is NOT applied to the user's Supabase until a distinct carwash
-- database exists and all migrations have passed independent review.

begin;

-- Preserve every original historic car, including genuinely zero-value
-- operations and five older rows with missing payment. No invented cash/card.
alter table public.entries add column if not exists legacy_recorded_total numeric(12,2);
alter table public.entries add column if not exists legacy_import_flag text;
alter table public.entries drop constraint if exists entries_legacy_import_flag_check;
alter table public.entries add constraint entries_legacy_import_flag_check check(
 legacy_import_flag is null or legacy_import_flag in(
  'ok','mismatch','missing_payment','zero_or_unknown'
 )
);
alter table public.entries drop constraint if exists gross_positive;
alter table public.entries add constraint gross_positive check(
 cash_paid+card_paid>0 or legacy_ref is not null
);
create index if not exists entries_legacy_import_flag_idx
 on public.entries(legacy_import_flag)
 where legacy_import_flag is not null and legacy_import_flag<>'ok';

-- The exact private snapshot SHA and every row are needed to reconcile a
-- staged import before any dashboard is allowed to claim it is complete.
create table if not exists public.carwash_import_batches(
 id uuid primary key default gen_random_uuid(),
 source_sha256 text not null unique check(source_sha256 ~ '^[0-9a-f]{64}$'),
 source_spreadsheet_id text not null,
 source_modified_at timestamptz not null,
 expected_entries integer not null check(expected_entries>0),
 expected_expenses integer not null check(expected_expenses>=0),
 expected_cash numeric(14,2) not null,
 expected_card numeric(14,2) not null,
 expected_expenses_amount numeric(14,2) not null,
 actual_entries integer,
 actual_expenses integer,
 actual_cash numeric(14,2),
 actual_card numeric(14,2),
 actual_expenses_amount numeric(14,2),
 status text not null default 'importing' check(status in('importing','verified','failed')),
 verified_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.carwash_import_batches enable row level security;
create policy carwash_manager_import_audit on public.carwash_import_batches
 for select to authenticated using(private.current_app_role()='owner');
revoke insert,update,delete on public.carwash_import_batches from anon,authenticated;
grant select on public.carwash_import_batches to authenticated;

-- Never store the 4-digit PIN, phone number, or IP address in this table.
-- The API hashes (HMAC pepper) the anonymous rate-limit key before calls.
create table if not exists public.carwash_pin_rate_limits(
 key_hash text primary key check(key_hash ~ '^[0-9a-f]{64}$'),
 started_at timestamptz not null default now(),
 attempt_count int not null default 0,
 blocked_until timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.carwash_pin_rate_limits enable row level security;
revoke all on public.carwash_pin_rate_limits from public,anon,authenticated;

create or replace function public.carwash_pin_consume_attempt(
 p_key_hash text,
 p_max_attempts int default 5,
 p_window_minutes int default 30
) returns boolean
language plpgsql security definer set search_path=''
as $carwash_pin_limit$
declare rec public.carwash_pin_rate_limits%rowtype;
        v_now timestamptz:=now();
begin
 if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
 or p_max_attempts<1 or p_max_attempts>20 or p_window_minutes<1 or p_window_minutes>1440
 then return false;end if;
 perform pg_advisory_xact_lock(hashtext(p_key_hash));
 insert into public.carwash_pin_rate_limits(key_hash)
 values(p_key_hash) on conflict do nothing;
 select * into rec from public.carwash_pin_rate_limits
 where key_hash=p_key_hash for update;
 if rec.blocked_until is not null and rec.blocked_until>v_now
 then return false;end if;
 if rec.started_at<v_now-make_interval(mins=>p_window_minutes) then
  update public.carwash_pin_rate_limits set
   started_at=v_now,attempt_count=1,blocked_until=null,updated_at=v_now
  where key_hash=p_key_hash;
  return true;
 end if;
 update public.carwash_pin_rate_limits
 set attempt_count=rec.attempt_count+1,
  blocked_until=case when rec.attempt_count+1>=p_max_attempts
     then v_now+make_interval(mins=>p_window_minutes) else null end,
  updated_at=v_now
 where key_hash=p_key_hash;
 return rec.attempt_count+1<=p_max_attempts;
end
$carwash_pin_limit$;
revoke all on function public.carwash_pin_consume_attempt(text,int,int)
 from PUBLIC,anon,authenticated;
grant execute on function public.carwash_pin_consume_attempt(text,int,int)
 to service_role;

create or replace function public.carwash_pin_clear_attempts(p_key_hash text)
returns boolean language plpgsql security definer set search_path=''
as $carwash_pin_clear$
begin
 if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then return false;end if;
 delete from public.carwash_pin_rate_limits where key_hash=p_key_hash;
 return true;
end
$carwash_pin_clear$;
revoke all on function public.carwash_pin_clear_attempts(text)
 from PUBLIC,anon,authenticated;
grant execute on function public.carwash_pin_clear_attempts(text) to service_role;

comment on table public.carwash_pin_rate_limits is
 'Carwash-only hashed PIN login attempt controls, without personal identifiers';

commit;
