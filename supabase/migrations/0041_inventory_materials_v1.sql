-- Inventory materials are manager-only. Purchases create exactly one operating
-- expense; usage only tracks material cost and never creates a second expense.
-- Quantity is measured in the item's selected unit (three decimal places).
create table if not exists public.carwash_inventory_items (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 2 and 100),
 unit text not null check (unit in ('لتر','عبوة','قطعة','كرتون','كيلو','رول')),
 stock_qty numeric(14,3) not null default 0 check(stock_qty>=0),
 min_qty numeric(14,3) not null default 0 check(min_qty>=0),
 avg_unit_cost numeric(14,4) not null default 0 check(avg_unit_cost>=0),
 active boolean not null default true,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists carwash_inventory_item_unique_name
 on public.carwash_inventory_items(lower(btrim(name)));
create table if not exists public.carwash_inventory_movements (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.carwash_inventory_items(id),
 kind text not null check(kind in ('purchase','use','adjust_in','adjust_out')),
 quantity numeric(14,3) not null check(quantity>0),
 total_cost numeric(14,2) not null default 0 check(total_cost>=0),
 unit_cost numeric(14,4) not null default 0 check(unit_cost>=0),
 payment_source text check(payment_source in ('cash','network','bank','other')),
 expense_id uuid references public.expenses(id),
 note text check(note is null or length(btrim(note)) between 3 and 300),
 request_id uuid not null unique,
 created_by uuid not null references auth.users(id),
 occurred_at timestamptz not null default now()
);
create index if not exists carwash_inventory_movements_recent
 on public.carwash_inventory_movements(item_id,occurred_at desc);
alter table public.carwash_inventory_items enable row level security;
alter table public.carwash_inventory_movements enable row level security;
revoke all on public.carwash_inventory_items from public,anon,authenticated;
revoke all on public.carwash_inventory_movements from public,anon,authenticated;
grant select,insert,update on public.carwash_inventory_items to service_role;
grant select,insert on public.carwash_inventory_movements to service_role;

-- Internal RPC callable solely from the manager-authenticated server API.
-- Row lock + request UUID keep the stock and expense update atomic.
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
  then raise exception 'Movement request ID conflict';end if;
  return jsonb_build_object('ok',true,'id',v_previous.id,'duplicate',true);
 end if;
 if p_purchase_total is null or p_purchase_total<0
  or p_purchase_total>10000000
  or p_purchase_total<>round(p_purchase_total,2)
 then raise exception 'Invalid material cost';end if;
 if p_kind='purchase' and p_purchase_total>0 and
  p_source not in ('cash','network','bank','other')
 then raise exception 'Purchase payment source required';end if;
 if p_kind<>'purchase' and p_purchase_total<>0
 then raise exception 'Only purchases may create an expense';end if;
 if p_kind in ('use','adjust_out') and p_qty>v_item.stock_qty
 then raise exception 'Stock cannot be negative';end if;
 if p_kind in ('purchase','adjust_in') then
  v_after:=v_item.stock_qty+p_qty;
  if p_kind='purchase' and p_purchase_total>0 then
   v_new_avg:=round((v_item.stock_qty*v_item.avg_unit_cost+p_purchase_total)/v_after,4);
  else v_new_avg:=round((v_item.stock_qty*v_item.avg_unit_cost+p_qty*v_item.avg_unit_cost)/v_after,4);
  end if;
 else
  v_after:=v_item.stock_qty-p_qty;
  v_new_avg:=v_item.avg_unit_cost;
 end if;
 v_value:=case
  when p_kind='purchase' then p_purchase_total
  else round(v_item.avg_unit_cost*p_qty,2) end;
 -- A purchase is recorded as an operating expense on its original day.
 -- Consumption is stock analytics only; it MUST NOT double count expenses.
 if p_kind='purchase' and p_purchase_total>0 then
  insert into public.expenses(
   expense_type,amount,notes,occurred_at,created_by,payment_source,
   recognition_kind,client_mutation_id
  ) values (
   'مواد استهلاكية',p_purchase_total,
   'شراء مخزون: '||v_item.name||coalesce(' — '||v_note,''),
   now(),p_manager,p_source,'operating',p_request::text
  ) returning id into v_expense;
 end if;
 update public.carwash_inventory_items
  set stock_qty=v_after,avg_unit_cost=v_new_avg,updated_at=now()
  where id=v_item.id;
 insert into public.carwash_inventory_movements(
  item_id,kind,quantity,total_cost,unit_cost,payment_source,expense_id,
  note,request_id,created_by
 ) values (
  p_item,p_kind,p_qty,v_value,case when p_kind='purchase' and p_qty>0
    then round(p_purchase_total/p_qty,4) else v_item.avg_unit_cost end,
  case when p_kind='purchase' then p_source else null end,
  v_expense,v_note,p_request,p_manager
 ) returning id into v_id;
 return jsonb_build_object('ok',true,'id',v_id,'duplicate',false,
  'stock',v_after,'expenseId',v_expense);
end;
$$;
revoke all on function public.carwash_inventory_apply(uuid,uuid,text,numeric,numeric,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.carwash_inventory_apply(uuid,uuid,text,numeric,numeric,text,text,uuid)
 to service_role;
