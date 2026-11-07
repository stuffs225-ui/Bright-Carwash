-- Executed ONLY against GitHub Actions disposable PostgreSQL.
-- Rehearses a logical JSON table restore into temporary tables.
-- Tests encrypted-envelope fidelity independently in lib/backupCrypto.test.ts.
begin;
create temporary table qa_source_entries(
 id uuid primary key,car_type text not null,service_type text not null,
 cash_paid numeric not null,card_paid numeric not null,
 occurred_at timestamptz not null,legacy_ref text
) on commit drop;
create temporary table qa_source_expenses(
 id uuid primary key,expense_type text not null,amount numeric not null,
 occurred_at timestamptz not null
) on commit drop;
insert into qa_source_entries values
 ('00000000-0000-4000-8000-000000000051','sedan','wash',20,0,'2026-11-07T00:10:00+03',null),
 ('00000000-0000-4000-8000-000000000052','suv','wash',10,25,'2026-11-07T00:20:00+03','old-200');
insert into qa_source_expenses values
 ('00000000-0000-4000-8000-000000000061','supplies',12,'2026-11-07T00:30:00+03');
create temporary table qa_archive on commit drop as
select jsonb_build_object(
 'format','bright-carwash-v2',
 'version',1,
 'tables',jsonb_build_object(
  'entries',(select jsonb_agg(to_jsonb(e)) from qa_source_entries e),
  'expenses',(select jsonb_agg(to_jsonb(e)) from qa_source_expenses e)
 )
) payload;
create temporary table qa_restored_entries(
 like qa_source_entries including all
) on commit drop;
create temporary table qa_restored_expenses(
 like qa_source_expenses including all
) on commit drop;
insert into qa_restored_entries(id,car_type,service_type,cash_paid,card_paid,occurred_at,legacy_ref)
select id,car_type,service_type,cash_paid,card_paid,occurred_at,legacy_ref
from jsonb_to_recordset((select payload->'tables'->'entries' from qa_archive))
 as e(id uuid,car_type text,service_type text,cash_paid numeric,card_paid numeric,
 occurred_at timestamptz,legacy_ref text);
insert into qa_restored_expenses(id,expense_type,amount,occurred_at)
select id,expense_type,amount,occurred_at
from jsonb_to_recordset((select payload->'tables'->'expenses' from qa_archive))
 as e(id uuid,expense_type text,amount numeric,occurred_at timestamptz);
do $$
begin
 if (select count(*) from qa_restored_entries)<>2 or
    (select sum(cash_paid+card_paid) from qa_restored_entries)<>55 or
    (select sum(amount) from qa_restored_expenses)<>12 or
    (select count(*) from qa_restored_entries where legacy_ref='old-200')<>1 or
    (select jsonb_agg(to_jsonb(e) order by id) from qa_source_entries e) is distinct from
    (select jsonb_agg(to_jsonb(e) order by id) from qa_restored_entries e) or
    (select jsonb_agg(to_jsonb(e) order by id) from qa_source_expenses e) is distinct from
    (select jsonb_agg(to_jsonb(e) order by id) from qa_restored_expenses e)
 then raise exception 'Synthetic logical backup restore mismatch'; end if;
end $$;
rollback;
