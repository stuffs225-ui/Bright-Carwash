-- Synthetic integration coverage for inventory (never execute on live data).
reset role;
do $inventory_qa$
declare
 v_item uuid;
 v_purchase jsonb;
 v_again jsonb;
 v_use jsonb;
 v_blocked boolean:=false;
 v_qty numeric;
 v_expenses integer;
 v_expense_id uuid;
 v_avg numeric;
begin
 insert into public.carwash_inventory_items(name,unit,min_qty,created_by)
 values('QA صابون مخزون','لتر',2,'22222222-2222-4222-8222-222222222222')
 returning id into v_item;
 v_purchase:=public.carwash_inventory_apply(
  '22222222-2222-4222-8222-222222222222',v_item,'purchase',10,
  100,'cash','QA فاتورة مخزون',
  'a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a001');
 v_again:=public.carwash_inventory_apply(
  '22222222-2222-4222-8222-222222222222',v_item,'purchase',10,
  100,'cash','QA فاتورة مخزون',
  'a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a001');
 if coalesce((v_again->>'duplicate')::boolean,false)<>true or
   v_again->>'id'<>v_purchase->>'id' then
  raise exception 'Inventory purchase was duplicated';end if;
 select stock_qty,avg_unit_cost into v_qty,v_avg from public.carwash_inventory_items
 where id=v_item;
 if v_qty<>10 or v_avg<>10 then raise exception 'Purchase stock cost incorrect';end if;
 select count(*) into v_expenses from public.expenses
 where client_mutation_id='a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a001';
 if v_expenses<>0 then raise exception 'Inventory purchase must not be an operating expense';end if;
 select id into v_expense_id from public.expenses
 where client_mutation_id='a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a001';
 if (select expense_id from public.carwash_inventory_movements
  where id=(v_purchase->>'id')::uuid) is distinct from v_expense_id
 then raise exception 'Purchase not linked to expense';end if;
 v_use:=public.carwash_inventory_apply(
  '22222222-2222-4222-8222-222222222222',v_item,'use',3,
  0,null,'QA استهلاك',
  'a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a002');
 if (select stock_qty from public.carwash_inventory_items where id=v_item)<>7
 then raise exception 'Consumption stock incorrect';end if;
 if (select amount from public.expenses where id=(v_use->>'expenseId')::uuid) is distinct from 30::numeric
 then raise exception 'Actual consumption must recognize exactly 30';end if;
 begin
  perform public.carwash_inventory_apply(
   '22222222-2222-4222-8222-222222222222',v_item,'use',8,
   0,null,'QA excess usage',
   'a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a003');
 exception when others then v_blocked:=true;end;
 if not v_blocked then raise exception 'Negative stock was permitted';end if;
 if (select count(*) from public.expenses
  where client_mutation_id like 'a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a00%')<>1
 then raise exception 'Usage duplicated inventory purchase expense';end if;
 -- Different purchase price uses weighted average; final issue consumes residual cents.
 perform public.carwash_inventory_apply(
  '22222222-2222-4222-8222-222222222222',v_item,'purchase',10,200,'network','QA second price',
  'a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a004');
 if (select inventory_value from public.carwash_inventory_items where id=v_item)<>270
 then raise exception 'Weighted inventory value incorrect';end if;
 perform public.carwash_inventory_apply(
  '22222222-2222-4222-8222-222222222222',v_item,'use',17,0,null,'QA final issue',
  'a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a005');
 if (select inventory_value+stock_qty from public.carwash_inventory_items where id=v_item)<>0
 then raise exception 'Final issue left residual inventory';end if;
 if (select sum(amount) from public.expenses where client_mutation_id like 'a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a00%')<>300
 then raise exception 'Material cost duplicated or lost';end if;
 v_blocked:=false;
 begin
  perform public.carwash_inventory_apply(
   '22222222-2222-4222-8222-222222222222',v_item,'purchase',10,999,'cash','QA changed retry',
   'a0a0a0a0-b0b0-40a0-80a0-a0a0a0a0a001');
 exception when others then v_blocked:=true;end;
 if not v_blocked then raise exception 'Changed retry amount accepted';end if;
end $inventory_qa$;
-- Inventory API must be the only access path; authenticated users cannot
-- directly query the manager-only stock tables.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $inventory_auth$
declare denied boolean:=false;
begin
 begin
  perform count(*) from public.carwash_inventory_items;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Worker role could read manager inventory';end if;
end $inventory_auth$;
reset role;
select 'INVENTORY PURCHASE/RETRY/EXPENSE/USAGE/RLS PASSED' as result;
