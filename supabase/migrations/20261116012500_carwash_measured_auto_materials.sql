-- Approved option #4: configured and measured per-service inventory consumption.
-- Fully OFF on install; no historical entry is touched, no default quantity.
-- Automatic service costs are operating expenses, while purchases remain an
-- inventory asset/cash movement to avoid double accounting.
create table if not exists public.carwash_inventory_recipes(
 id uuid primary key default gen_random_uuid(),
 car_type text not null check(length(btrim(car_type)) between 2 and 80),
 service_type text not null check(length(btrim(service_type)) between 2 and 80),
 item_id uuid not null references public.carwash_inventory_items(id) on delete restrict,
 quantity numeric(14,3) not null check(quantity>0 and quantity<=100000),
 active boolean not null default false,
 physical_count_confirmed_at timestamptz,
 physical_count_confirmed_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(car_type,service_type,item_id),
 constraint carwash_recipe_requires_count check(
  not active or (physical_count_confirmed_at is not null and physical_count_confirmed_by is not null)
 )
);
create index if not exists carwash_inventory_recipes_active_by_service
 on public.carwash_inventory_recipes(car_type,service_type,item_id) where active;
alter table public.carwash_inventory_recipes enable row level security;
create trigger carwash_material_recipe_audit
 after insert or update on public.carwash_inventory_recipes
 for each row execute function private.audit_row();
revoke all on public.carwash_inventory_recipes from public,anon,authenticated;
grant select,insert,update on public.carwash_inventory_recipes to service_role;
alter table public.carwash_inventory_movements
 add column if not exists entry_id uuid references public.entries(id) on delete restrict;
create unique index if not exists carwash_inventory_once_per_entry_material
 on public.carwash_inventory_movements(entry_id,item_id) where entry_id is not null;
insert into public.settings(key,value) values
 ('inventory_auto_materials_enabled','false'::jsonb)
 on conflict(key) do nothing;
-- This trigger is part of the INSERT transaction. A retried registration with
-- the same client mutation ID does not reinsert the entry or consume twice.
create or replace function private.carwash_auto_consume_entry()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
 v_enabled boolean:=false;
 v_recipe record;
 v_item public.carwash_inventory_items%rowtype;
 v_after numeric(14,3);
 v_cost numeric(14,2);
 v_balance numeric(14,2);
 v_avg numeric(14,4);
 v_expense uuid;
 v_actor uuid;
begin
 -- Existing imported entries and any day prior to feature enablement cannot
 -- be backfilled by this function. A null business date is not a live entry.
 if new.business_date is null or new.legacy_ref is not null or
    new.deleted_at is not null then return new;end if;
 select (value='true'::jsonb) into v_enabled
 from public.settings where key='inventory_auto_materials_enabled';
 if not coalesce(v_enabled,false) then return new;end if;
 if not exists(select 1 from public.settings
  where key='inventory_accounting_version' and value='2'::jsonb)
 then raise exception 'Automatic material accounting not ready';end if;
 -- Prefer the authenticated manager already credited with this entry;
 -- worker-link entries may still use their issuing manager as created_by.
 select m.user_id into v_actor
 from public.app_members m
 where m.user_id=new.created_by and m.role='manager' and m.active;
 if v_actor is null then
  select m.user_id into v_actor
  from public.app_members m
  where m.role='manager' and m.active
  order by m.user_id limit 1;
 end if;
 if v_actor is null then raise exception 'Inventory manager unavailable';end if;
 for v_recipe in
  select r.item_id,r.quantity from public.carwash_inventory_recipes r
  where r.active and r.car_type=new.car_type and r.service_type=new.service_type
  order by r.item_id for share
 loop
  select * into v_item from public.carwash_inventory_items
   where id=v_recipe.item_id for update;
  if not found or not v_item.active then
   raise exception 'Configured automatic material unavailable';end if;
  if v_item.stock_qty < v_recipe.quantity then
   raise exception 'Insufficient measured material stock for carwash service';
  end if;
  v_after:=v_item.stock_qty-v_recipe.quantity;
  v_cost:=case when v_after=0 then v_item.inventory_value
   else least(v_item.inventory_value,
    round(v_item.inventory_value*v_recipe.quantity/v_item.stock_qty,2))
   end;
  v_balance:=v_item.inventory_value-v_cost;
  v_avg:=case when v_after=0 then 0 else round(v_balance/v_after,4) end;
  v_expense:=null;
  if v_cost>0 then
   insert into public.expenses(expense_type,amount,notes,occurred_at,created_by,
    payment_source,recognition_kind,client_mutation_id)
   values('مواد استهلاكية',v_cost,
    'استهلاك آلي للسيارة '||new.id::text||' — '||v_item.name,
    new.occurred_at,v_actor,null,'operating',
    'auto-material:'||new.id::text||':'||v_item.id::text)
   returning id into v_expense;
  end if;
  update public.carwash_inventory_items
   set stock_qty=v_after,inventory_value=v_balance,avg_unit_cost=v_avg,updated_at=now()
   where id=v_item.id;
  insert into public.carwash_inventory_movements(
   item_id,entry_id,kind,quantity,total_cost,unit_cost,payment_source,
   expense_id,note,request_id,created_by,stock_before,stock_after
  )values(
   v_item.id,new.id,'use',v_recipe.quantity,v_cost,v_item.avg_unit_cost,null,
   v_expense,'استهلاك آلي لعملية تسجيل سيارة',gen_random_uuid(),
   v_actor,v_item.stock_qty,v_after
  );
 end loop;
 return new;
end $function$;
revoke all on function private.carwash_auto_consume_entry() from public,anon,authenticated;
create trigger carwash_auto_materials_after_car_registration
 after insert on public.entries for each row
 execute function private.carwash_auto_consume_entry();
