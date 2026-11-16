-- Synthetic QA ONLY. Every new car, stock movement and expense is rolled back.
begin;
do $auto_materials_qa$
declare
 m uuid;
 material uuid;
 car1 uuid;
 car2 uuid;
 previous_qty numeric;
 previous_value numeric;
 failed boolean:=false;
 v_day date:=(now() at time zone 'Asia/Riyadh')::date;
begin
 select user_id into m from public.app_members where role='manager' and active limit 1;
 if m is null then raise exception 'Synthetic manager missing';end if;
 perform set_config('request.jwt.claim.sub',m::text,true);
 if (select value from public.settings where key='inventory_auto_materials_enabled')<>'false'::jsonb
 then raise exception 'Automatic materials must be OFF on migration install';end if;
 insert into public.carwash_inventory_items(name,unit,min_qty,created_by)
 values('QA مادة استهلاك آلي','لتر',0.5,m) returning id into material;
 perform public.carwash_inventory_apply(m,material,'adjust_in',10,100,null,
  'QA رصيد افتتاحي مؤكد بعد جرد فعلي',
  'f0f0f0f0-a0a0-40a0-80a0-000000000001');
 insert into public.carwash_inventory_recipes(car_type,service_type,item_id,quantity,
  active,physical_count_confirmed_at,physical_count_confirmed_by)
 values('سيارة صغيرة','غسيل كامل',material,0.500,true,now(),m);
 -- An active recipe remains harmless until an owner enables the global policy.
 insert into public.entries(id,car_type,service_type,cash_paid,card_paid,
  discount_amount,occurred_at,created_by,client_mutation_id)
 values(gen_random_uuid(),'سيارة صغيرة','غسيل كامل',25,0,0,
  now(),m,'qa-off-materials') returning id into car1;
 if (select stock_qty from public.carwash_inventory_items where id=material)<>10
 then raise exception 'Disabled auto consumption deducted inventory';end if;
 update public.settings set value='true'::jsonb
 where key='inventory_auto_materials_enabled';
 insert into public.entries(id,car_type,service_type,cash_paid,card_paid,
  discount_amount,occurred_at,created_by,client_mutation_id)
 values(gen_random_uuid(),'سيارة صغيرة','غسيل كامل',25,0,0,
  now(),m,'qa-first-auto-material') returning id into car1;
 if (select stock_qty from public.carwash_inventory_items where id=material)<>9.500
  or (select inventory_value from public.carwash_inventory_items where id=material)<>95.00
 then raise exception 'Automatic material quantity / cost incorrect';end if;
 if (select count(*) from public.carwash_inventory_movements
  where entry_id=car1 and item_id=material and kind='use')<>1
 then raise exception 'Car usage did not create exactly one stock movement';end if;
 if (select count(*) from public.expenses e
  join public.carwash_inventory_movements mv on mv.expense_id=e.id
  where mv.entry_id=car1 and e.amount=5 and e.payment_source is null)<>1
 then raise exception 'Consumption cost must be recognized once as noncash operating expense';end if;
 insert into public.entries(id,car_type,service_type,cash_paid,card_paid,
  discount_amount,occurred_at,created_by,client_mutation_id)
 values(car1,'سيارة صغيرة','غسيل كامل',25,0,0,
  now(),m,'qa-first-auto-material') on conflict (id) do nothing;
 if (select stock_qty from public.carwash_inventory_items where id=material)<>9.500
 then raise exception 'Duplicate car request consumed inventory twice';end if;
 -- Recipe changes apply to new operations only.
 update public.carwash_inventory_recipes set quantity=1,updated_at=now()
 where item_id=material;
 if not exists(select 1 from public.audit_events
  where table_name='carwash_inventory_recipes' and action='UPDATE')
 then raise exception 'Material recipe edits are not audited';end if;
 insert into public.entries(id,car_type,service_type,cash_paid,card_paid,
  discount_amount,occurred_at,created_by,client_mutation_id)
 values(gen_random_uuid(),'سيارة صغيرة','غسيل كامل',25,0,0,
  now(),m,'qa-second-auto-material') returning id into car2;
 if (select quantity from public.carwash_inventory_movements where entry_id=car1)<>0.500
  or (select quantity from public.carwash_inventory_movements where entry_id=car2)<>1.000
 then raise exception 'Recipe edit rewrote original consumption';end if;
 select stock_qty,inventory_value into previous_qty,previous_value
 from public.carwash_inventory_items where id=material;
 update public.carwash_inventory_recipes set quantity=1000 where item_id=material;
 begin
  insert into public.entries(id,car_type,service_type,cash_paid,card_paid,
   discount_amount,occurred_at,created_by,client_mutation_id)
  values(gen_random_uuid(),'سيارة صغيرة','غسيل كامل',25,0,0,
   now(),m,'qa-material-insufficient');
 exception when others then
  if position('Insufficient measured material stock' in sqlerrm)>0 then failed:=true;
  else raise;end if;
 end;
 if not failed then raise exception 'Insufficient material failed to block unsafe financial recording';end if;
 if (select stock_qty from public.carwash_inventory_items where id=material)<>previous_qty
  or (select inventory_value from public.carwash_inventory_items where id=material)<>previous_value
  or exists(select 1 from public.entries where client_mutation_id='qa-material-insufficient')
 then raise exception 'Rejected car left partial stock or accounting writes';end if;
 if has_table_privilege('authenticated','public.carwash_inventory_recipes','SELECT')
  or has_table_privilege('authenticated','public.carwash_inventory_recipes','UPDATE')
  or has_table_privilege('anon','public.carwash_inventory_recipes','SELECT')
 then raise exception 'Untrusted clients can read or modify material recipes';end if;
end $auto_materials_qa$;
rollback;
select 'AUTO MATERIALS ATOMICITY, HISTORICAL SNAPSHOT, PRIVILEGES PASS' as result;
