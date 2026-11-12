-- Owner approved weighted-average costing on 2026-11-12.
-- Stop for explicit historical reconciliation if stock was used under the old policy.
do $$ begin
 if exists(select 1 from public.carwash_inventory_movements) or
 exists(select 1 from public.carwash_inventory_items where stock_qty<>0) then
  raise exception 'Existing inventory needs reviewed conversion; no historical rewrite permitted';
 end if;
end $$;
alter table public.carwash_inventory_items add column inventory_value numeric(14,2) not null default 0 check(inventory_value>=0);
alter table public.carwash_inventory_movements
 add column cash_movement_id uuid references public.carwash_cash_movements(id),
 add column stock_before numeric(14,3),add column stock_after numeric(14,3);
create index carwash_inventory_cash_reference on public.carwash_inventory_movements(cash_movement_id) where cash_movement_id is not null;
create or replace function public.carwash_inventory_apply(
 p_manager uuid,p_item uuid,p_kind text,p_qty numeric,
 p_purchase_total numeric,p_source text,p_note text,p_request uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v_item public.carwash_inventory_items%rowtype;
 v_previous public.carwash_inventory_movements%rowtype;
 v_id uuid;
 v_cash_id uuid;
 v_day date:=(now() at time zone 'Asia/Riyadh')::date;
 v_balance numeric(14,2);
 v_expense uuid;
 v_value numeric(14,2);
 v_new_avg numeric(14,4);
 v_after numeric(14,3);
 v_note text:=nullif(btrim(coalesce(p_note,'')),'');
begin
 if p_manager is null or not exists (
  select 1 from public.app_members m where m.user_id=p_manager
   and m.role='manager' and m.active
 ) then raise exception 'Manager membership required';end if;
 if p_request is null or p_item is null
   or p_kind not in ('purchase','use','adjust_in','adjust_out')
   or p_qty is null or p_qty<=0 or p_qty>100000
   or p_qty<>round(p_qty,3)
 then raise exception 'Invalid stock movement';end if;
 if v_note is not null and (length(v_note)<3 or length(v_note)>300)
 then raise exception 'Invalid stock movement note';end if;
 select * into v_previous from public.carwash_inventory_movements
  where request_id=p_request;
 if found then
  if v_previous.created_by<>p_manager or v_previous.item_id<>p_item
   or v_previous.kind<>p_kind or v_previous.quantity<>p_qty
   or (p_kind in ('purchase','adjust_in') and v_previous.total_cost is distinct from p_purchase_total)
   or v_previous.payment_source is distinct from (case when p_kind='purchase' then p_source else null end)
   or v_previous.note is distinct from v_note
  then raise exception 'Movement request ID conflict';end if;
  return jsonb_build_object('ok',true,'id',v_previous.id,'duplicate',true);
 end if;
 select * into v_item from public.carwash_inventory_items
  where id=p_item for update;
 if not found or not v_item.active then raise exception 'Inventory item unavailable';end if;
 -- Retry check after locking so concurrent identical submissions cannot
 -- double-debit inventory or expenses.
 select * into v_previous from public.carwash_inventory_movements
  where request_id=p_request;
 if found then
  if v_previous.created_by<>p_manager or v_previous.item_id<>p_item
   or v_previous.kind<>p_kind or v_previous.quantity<>p_qty
   or (p_kind in ('purchase','adjust_in') and v_previous.total_cost is distinct from p_purchase_total)
   or v_previous.payment_source is distinct from (case when p_kind='purchase' then p_source else null end)
   or v_previous.note is distinct from v_note
  then raise exception 'Movement request ID conflict';end if;
  return jsonb_build_object('ok',true,'id',v_previous.id,'duplicate',true);
 end if;
 if p_purchase_total is null or p_purchase_total<0
  or p_purchase_total>10000000
  or p_purchase_total<>round(p_purchase_total,2)
 then raise exception 'Invalid material cost';end if;
 if p_kind='purchase' and p_purchase_total>0 and
  coalesce(p_source,'') not in ('cash','network','bank','other')
 then raise exception 'Purchase payment source required';end if;
 if p_kind not in ('purchase','adjust_in') and p_purchase_total<>0
 then raise exception 'Only purchases may create an expense';end if;
 if p_kind in ('use','adjust_out') and p_qty>v_item.stock_qty
 then raise exception 'Stock cannot be negative';end if;
 if p_kind in ('adjust_in','adjust_out') and coalesce(length(v_note),0)<3 then
  raise exception 'Stock adjustment requires reason';end if;
 insert into public.carwash_days(business_date) values(v_day) on conflict do nothing;
 perform 1 from public.carwash_days where business_date=v_day and status='open' for update;
 if not found then raise exception 'Inventory day already approved or under review';end if;
 if exists(select 1 from public.accounting_months where period=to_char(v_day,'YYYY-MM') and status='approved')
 then raise exception 'Inventory month already under review';end if;
 if p_kind in ('purchase','adjust_in') then
  v_after:=v_item.stock_qty+p_qty;
  v_value:=p_purchase_total;
  v_balance:=v_item.inventory_value+v_value;
 else
  v_after:=v_item.stock_qty-p_qty;
  -- Consume the remaining cents on the last issue; never leave a value at zero quantity.
  v_value:=case when v_after=0 then v_item.inventory_value
   else least(v_item.inventory_value,round(v_item.inventory_value*p_qty/v_item.stock_qty,2)) end;
  v_balance:=v_item.inventory_value-v_value;
 end if;
 v_new_avg:=case when v_after=0 then 0 else round(v_balance/v_after,4) end;
 -- Purchases are inventory/cash movements, never operating expenses.
 if p_kind='purchase' and p_source='cash' and p_purchase_total>0 then
  insert into public.carwash_cash_movements(business_date,direction,amount,reason,created_by)
  values(v_day,'out',p_purchase_total,'شراء مخزون: '||v_item.name,p_manager)
  returning id into v_cash_id;
 end if;
 -- Actual issue or approved shrinkage is recognized once at weighted average cost.
 if p_kind in ('use','adjust_out') and v_value>0 then
  insert into public.expenses(expense_type,amount,notes,occurred_at,created_by,
   payment_source,recognition_kind,client_mutation_id)
  values('مواد استهلاكية',v_value,
   case when p_kind='use' then 'استهلاك مخزون: ' else 'فرق جرد مخزون: ' end||v_item.name||coalesce(' — '||v_note,''),
   now(),p_manager,null,'operating',p_request::text) returning id into v_expense;
 end if;
 update public.carwash_inventory_items
  set stock_qty=v_after,avg_unit_cost=v_new_avg,inventory_value=v_balance,updated_at=now()
  where id=v_item.id;
 insert into public.carwash_inventory_movements(
  item_id,kind,quantity,total_cost,unit_cost,payment_source,expense_id,
  note,request_id,created_by,cash_movement_id,stock_before,stock_after
 ) values (
  p_item,p_kind,p_qty,v_value,case when p_kind='purchase' and p_qty>0
    then round(p_purchase_total/p_qty,4) else v_item.avg_unit_cost end,
  case when p_kind='purchase' then p_source else null end,
  v_expense,v_note,p_request,p_manager,v_cash_id,v_item.stock_qty,v_after
 ) returning id into v_id;
 return jsonb_build_object('ok',true,'id',v_id,'duplicate',false,
  'stock',v_after,'expenseId',v_expense);
end;
$$;
revoke all on function public.carwash_inventory_apply(uuid,uuid,text,numeric,numeric,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.carwash_inventory_apply(uuid,uuid,text,numeric,numeric,text,text,uuid)
 to service_role;

insert into public.settings(key,value) values('inventory_accounting_version','2'::jsonb)
on conflict(key) do update set value=excluded.value;

-- Linked inventory postings cannot be edited independently from their stock movement.
create or replace function private.guard_inventory_posting()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='expenses' and exists(select 1 from public.carwash_inventory_movements where expense_id=OLD.id) then
  raise exception 'Inventory consumption requires a documented stock correction';
 elsif TG_TABLE_NAME='carwash_cash_movements' and exists(select 1 from public.carwash_inventory_movements where cash_movement_id=OLD.id) then
  raise exception 'Inventory payment requires a documented stock correction';
 end if;
 if TG_OP='DELETE' then return OLD;end if;return NEW;
end $$;
create trigger guard_inventory_expense before update or delete on public.expenses
for each row execute function private.guard_inventory_posting();
create trigger guard_inventory_cash before update or delete on public.carwash_cash_movements
for each row execute function private.guard_inventory_posting();
revoke all on function private.guard_inventory_posting() from public,anon,authenticated;
