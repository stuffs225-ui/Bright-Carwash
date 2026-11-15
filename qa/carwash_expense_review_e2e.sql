-- Safe review of historical expense metadata. Never edit finance columns.
begin;
do $review$
declare v_expense uuid;v_review uuid;v_original numeric;v_source text;
begin
 insert into public.expenses(expense_type,amount,notes,occurred_at,payment_source)
 values('مصروفات أخرى',123.45,'Synthetic mixed source; amount must remain',now(),null)
 returning id,amount,payment_source into v_expense,v_original,v_source;
 insert into public.carwash_expense_reviews(
  expense_id,review_state,proposed_payment_source,evidence_note,reviewed_by)
 values(v_expense,'proposed','mixed','Receipt includes cash and network',
  '99999999-9999-4999-8999-999999999981')
 returning id into v_review;
 update public.carwash_expense_reviews
 set review_state='reviewed',evidence_note='Confirmed only; no financial correction',
  proposed_payment_source=null,reviewed_at=now()
 where id=v_review;
 if not exists(select 1 from public.carwash_expense_reviews
  where id=v_review and review_state='reviewed') then
  raise exception 'Review state update failed';end if;
 if (select amount from public.expenses where id=v_expense)<>v_original
 or (select payment_source from public.expenses where id=v_expense) is distinct from v_source
 then raise exception 'Review modified historical expense figures';end if;
 if not exists(select 1 from public.audit_events
  where table_name='carwash_expense_reviews' and row_id=v_review::text and action='UPDATE')
 then raise exception 'Expense review edits not audited';end if;
 if has_table_privilege('anon','public.carwash_expense_reviews','SELECT')
 or has_table_privilege('authenticated','public.carwash_expense_reviews','DELETE')
 then raise exception 'Expense review privileges too broad';end if;
 if not exists(select 1 from pg_policies
  where schemaname='public' and tablename='carwash_expense_reviews'
  and policyname='carwash_manager_review_read'
  and qual ilike '%current_app_role%')
 then raise exception 'Expense review management is not role gated';end if;
end $review$;
rollback;
select 'EXPENSE REVIEW HISTORIC IMMUTABILITY AND AUDIT PASS' as result;
