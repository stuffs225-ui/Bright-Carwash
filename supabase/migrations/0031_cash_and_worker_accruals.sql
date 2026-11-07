-- Additive finance governance: separate cash movement from accrued salaries and payouts.
-- No updates/backfills of historical transactions, amounts or worker balances.
alter table public.expenses
 add column if not exists payment_source text,
 add column if not exists recognition_kind text,
 add column if not exists source_ledger_id uuid references public.worker_ledger(id);
alter table public.expenses
 add constraint carwash_expenses_payment_source_check
 check(payment_source is null or payment_source in ('cash','network','bank','other')),
 add constraint carwash_expenses_recognition_check
 check(recognition_kind is null or recognition_kind in ('operating','salary_accrual'));
create unique index if not exists carwash_expenses_source_ledger_unique
 on public.expenses(source_ledger_id) where source_ledger_id is not null;

create table if not exists public.carwash_cash_movements(
 id uuid primary key default gen_random_uuid(),
 business_date date not null,
 direction text not null check(direction in ('in','out')),
 amount numeric(12,2) not null check(amount>0 and amount=round(amount,2)),
 reason text not null check(length(trim(reason))>=5),
 created_by uuid not null references auth.users(id),
 occurred_at timestamptz not null default now(),
 deleted_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.carwash_cash_movements enable row level security;
create index if not exists carwash_cash_movements_day_idx
 on public.carwash_cash_movements(business_date) where deleted_at is null;
grant select,insert,update on public.carwash_cash_movements to authenticated;
create policy carwash_manager_cash_read on public.carwash_cash_movements
 for select to authenticated using(private.current_app_role()='owner');
create policy carwash_manager_cash_insert on public.carwash_cash_movements
 for insert to authenticated with check(
  private.current_app_role()='owner' and created_by=auth.uid()
 );
create policy carwash_manager_cash_update on public.carwash_cash_movements
 for update to authenticated using(private.current_app_role()='owner')
 with check(private.current_app_role()='owner');
create trigger carwash_cash_audit after insert or update or delete
 on public.carwash_cash_movements for each row execute function private.audit_row();

create or replace function private.guard_cash_movement_period()
 returns trigger language plpgsql security definer set search_path='' as $function$
declare v_status text;v_month text;
begin
 if TG_OP='UPDATE' then
  select status into v_status from public.carwash_days
   where business_date=OLD.business_date;
  if v_status='approved' then raise exception 'Cash movement day already approved';end if;
  select status into v_status from public.accounting_months
   where period=to_char(OLD.business_date,'YYYY-MM');
  if v_status='approved' then raise exception 'Cash movement month already approved';end if;
 end if;
 select status into v_status from public.carwash_days
 where business_date=NEW.business_date for share;
 if v_status='approved' or v_status='awaiting_owner' then
  raise exception 'Cash movement day not open';end if;
 select status into v_status from public.accounting_months
  where period=to_char(NEW.business_date,'YYYY-MM');
 if v_status='approved' then raise exception 'Cash movement month already approved';end if;
 if NEW.business_date>(now() at time zone 'Asia/Riyadh')::date then
  raise exception 'Cash movement cannot be future dated';end if;
 return NEW;
end $function$;
create trigger carwash_cash_movement_guard
 before insert or update on public.carwash_cash_movements
 for each row execute function private.guard_cash_movement_period();

-- Earned wages are recognized once as salary expenses, but actual payouts
-- only move cash/worker balances: no second expense is inserted on payment.
-- Existing historical salary expenses and their amounts stay untouched.
create or replace function private.link_carwash_worker_earning_expense()
 returns trigger language plpgsql security definer set search_path='' as $function$
declare v_expense uuid;
begin
 if NEW.kind<>'earning' then return NEW;end if;
 if NEW.expense_id is null then
  insert into public.expenses(
   expense_type,amount,notes,occurred_at,client_recorded_at,
   salary_worker_id,payment_source,recognition_kind,source_ledger_id,created_by,
   client_mutation_id
  ) values(
   'راتب',NEW.amount,NEW.notes,NEW.occurred_at,now(),NEW.worker_id,
   null,'salary_accrual',NEW.id,auth.uid(),'worker-earning:'||NEW.id::text
  ) returning id into v_expense;
  update public.worker_ledger set expense_id=v_expense where id=NEW.id;
 else
  update public.expenses set amount=NEW.amount,notes=NEW.notes,
   occurred_at=NEW.occurred_at,deleted_at=NEW.deleted_at
   where id=NEW.expense_id and source_ledger_id=NEW.id;
 end if;
 return NEW;
end $function$;
create trigger carwash_earning_to_expense
 after insert or update of kind,amount,occurred_at,notes,deleted_at
 on public.worker_ledger
 for each row execute function private.link_carwash_worker_earning_expense();

create or replace function private.guard_worker_ledger_month()
 returns trigger language plpgsql security definer set search_path='' as $function$
declare v_period text;v_status text;
begin
 v_period:=to_char(NEW.occurred_at at time zone 'Asia/Riyadh','YYYY-MM');
 select status into v_status from public.accounting_months
  where period=v_period for share;
 if v_status='approved' then raise exception 'Worker ledger month approved';end if;
 if TG_OP='UPDATE' then
  v_period:=to_char(OLD.occurred_at at time zone 'Asia/Riyadh','YYYY-MM');
  select status into v_status from public.accounting_months where period=v_period for share;
  if v_status='approved' then raise exception 'Previous worker ledger month approved';end if;
 end if;
 return NEW;
end $function$;
create trigger carwash_worker_ledger_month_guard
 before insert or update on public.worker_ledger
 for each row execute function private.guard_worker_ledger_month();

alter table public.carwash_day_settlements
 add column if not exists expected_cash numeric(12,2),
 add column if not exists cash_expenses numeric(12,2),
 add column if not exists cash_worker_payments numeric(12,2),
 add column if not exists cash_movements_net numeric(12,2);
