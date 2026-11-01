-- Keep salary expenses and worker ledger in one PostgreSQL transaction, online or offline.
alter table public.expenses add column if not exists salary_worker_id uuid references public.workers(id);
alter table public.expenses add column if not exists salary_payment_source text
 check(salary_payment_source is null or salary_payment_source in ('cash','atm','network','other'));
create unique index if not exists worker_ledger_one_payment_per_expense
 on public.worker_ledger(expense_id) where expense_id is not null;

create or replace function private.sync_salary_ledger()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
 if new.expense_type = 'راتب' and new.salary_worker_id is not null
    and new.deleted_at is null then
   insert into public.worker_ledger(
     worker_id,kind,amount,occurred_at,payment_source,expense_id,notes,deleted_at
   ) values(
     new.salary_worker_id,'payment',new.amount,new.occurred_at,
     coalesce(new.salary_payment_source,'other'),new.id,new.notes,null
   )
   on conflict (expense_id) where expense_id is not null
   do update set worker_id=excluded.worker_id,amount=excluded.amount,
     occurred_at=excluded.occurred_at,
     payment_source=excluded.payment_source,
     notes=excluded.notes,deleted_at=null;
 else
   update public.worker_ledger
      set deleted_at = now()
    where expense_id = new.id and deleted_at is null;
 end if;
 return new;
end $$;
revoke all on function private.sync_salary_ledger() from public;
drop trigger if exists expenses_sync_salary on public.expenses;
create trigger expenses_sync_salary after insert or update of
 expense_type,amount,notes,deleted_at,salary_worker_id,salary_payment_source,occurred_at
 on public.expenses for each row execute function private.sync_salary_ledger();
