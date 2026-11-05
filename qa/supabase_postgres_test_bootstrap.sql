-- Synthetic Supabase-like bootstrap for GitHub CI PostgreSQL smoke tests.
-- Local test only: no real customer, owner or Supabase project credentials.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
 id uuid primary key,
 phone text,
 email text
);
create or replace function auth.uid()
returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create schema storage;
create table storage.buckets (
 id text primary key,
 name text not null,
 public boolean not null default false
);
create table storage.objects (
 id uuid primary key default gen_random_uuid(),
 bucket_id text not null references storage.buckets(id),
 name text not null,
 unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert,update on storage.objects to authenticated;
grant usage on schema public to authenticated,anon;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
alter default privileges in schema public grant usage,select on sequences to authenticated;
create publication supabase_realtime;
