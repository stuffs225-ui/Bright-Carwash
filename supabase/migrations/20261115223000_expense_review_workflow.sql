-- Expense-review decisions are separate metadata. They NEVER mutate
-- historical expenses, ledger amounts, payment sources, or closed periods.
create table if not exists public.carwash_expense_reviews(
 id uuid primary key default gen_random_uuid(),
 expense_id uuid not null unique references public.expenses(id) on delete restrict,
 review_state text not null default 'investigating' check(
  review_state in ('investigating','proposed','reviewed','dismissed')
 ),
 proposed_payment_source text check(
  proposed_payment_source is null or
  proposed_payment_source in ('cash','network','bank','other','mixed')
 ),
 evidence_note text,
 reviewed_by uuid not null default auth.uid(),
 reviewed_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 constraint carwash_expense_review_note_length check(
  evidence_note is null or length(evidence_note)<=1000
 ),
 constraint carwash_expense_review_proposal_evidence check(
  review_state<>'proposed' or
  (proposed_payment_source is not null and length(btrim(coalesce(evidence_note,'')))>=5)
 )
);
alter table public.carwash_expense_reviews enable row level security;
grant select,insert,update on public.carwash_expense_reviews to authenticated;
revoke delete on public.carwash_expense_reviews from public,anon,authenticated;
create policy carwash_manager_review_read on public.carwash_expense_reviews
 for select to authenticated
 using (auth.uid() is not null and private.current_app_role() in ('owner','manager'));
create policy carwash_manager_review_insert on public.carwash_expense_reviews
 for insert to authenticated
 with check (auth.uid() is not null and
  private.current_app_role() in ('owner','manager') and reviewed_by=auth.uid());
create policy carwash_manager_review_update on public.carwash_expense_reviews
 for update to authenticated
 using (auth.uid() is not null and private.current_app_role() in ('owner','manager'))
 with check (auth.uid() is not null and
  private.current_app_role() in ('owner','manager') and reviewed_by=auth.uid());
create index carwash_expense_review_state_recent_idx
 on public.carwash_expense_reviews(review_state,reviewed_at desc);
create trigger carwash_expense_review_audit
 after insert or update on public.carwash_expense_reviews
 for each row execute function private.audit_row();
