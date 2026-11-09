-- Synthetic-only policy matrix. Never point this script at production.
-- Requires the existing QA fixture + carwash_integrated_v2_e2e.sql.
reset role;
do $independent_addons$
declare
 p public.entry_presets%rowtype;
 v_one jsonb;
 v_item uuid;
 v_denied boolean;
 v_original_service jsonb;
 v_original_addon jsonb;
 v_extra jsonb:='[{"name":"إضافة QA مؤقتة","price":3.50}]'::jsonb;
begin
 select * into p from public.entry_presets where active=true and amount>0
  order by sort_order,amount limit 1;
 if p.id is null then raise exception 'Missing synthetic active preset';end if;
 select value into v_original_service from public.settings
  where key='worker_manual_service_enabled';
 select value into v_original_addon from public.settings
  where key='worker_manual_addon_enabled';

 -- C: Manual service disabled, add-ons enabled: matching official preset MUST work.
 insert into public.settings(key,value) values
  ('worker_manual_service_enabled','false'::jsonb),
  ('worker_manual_addon_enabled','true'::jsonb)
 on conflict(key) do update set value=excluded.value;
 v_one:=public.carwash_worker_link_record_exception(
  repeat('e',64),p.car_type,p.service_type,p.amount,v_extra,'[]'::jsonb,
  p.amount+3.50,0,0,'QA addon-only','إضافة مع السعر الرسمي',
  'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a001'::uuid,null,false);
 if not coalesce((v_one->>'ok')::boolean,false)
 then raise exception 'Addon-only official preset should succeed';end if;
 v_item:=(v_one->>'id')::uuid;
 if (select count(*) from public.carwash_entry_line_items
     where entry_id=v_item and category='manual_addon' and amount=3.50)<>1
 then raise exception 'Temporary addon was not snapshotted';end if;
 if exists(select 1 from public.entries where id=v_item
     and (one_time_service_name is not null or one_time_base_price is not null))
 then raise exception 'Official service was incorrectly classified as manual';end if;
 if (select count(*) from public.entry_presets
     where id=p.id and amount=p.amount)<>1
 then raise exception 'Official preset mutated';end if;

 -- C (negative): a NEW manual base service remains forbidden.
 v_denied:=false;
 begin
  perform public.carwash_worker_link_record_exception(
   repeat('e',64),p.car_type,'QA خدمة غير رسمية',50,'[]'::jsonb,'[]'::jsonb,
   50,0,0,'QA blocked','تجاوز سياسة الخدمة',
   'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a002'::uuid,null,false);
 exception when others then v_denied:=true;end;
 if not v_denied then raise exception 'Manual base price bypassed disabled policy';end if;

 -- B: Service enabled, add-ons disabled: manual service works, addons fail.
 update public.settings set value='true'::jsonb
  where key='worker_manual_service_enabled';
 update public.settings set value='false'::jsonb
  where key='worker_manual_addon_enabled';
 v_one:=public.carwash_worker_link_record_exception(
  repeat('e',64),p.car_type,'QA خدمة غير رسمية',50,'[]'::jsonb,'[]'::jsonb,
  50,0,0,'QA manual','سياسة الخدمة مسموحة',
  'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a003'::uuid,null,false);
 if not coalesce((v_one->>'ok')::boolean,false)
 then raise exception 'Allowed manual service rejected';end if;
 v_denied:=false;
 begin
  perform public.carwash_worker_link_record_exception(
   repeat('e',64),p.car_type,p.service_type,p.amount,v_extra,'[]'::jsonb,
   p.amount+3.50,0,0,'QA blocked','إضافة محظورة بالسياسة',
   'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a004'::uuid,null,false);
 exception when others then v_denied:=true;end;
 if not v_denied then raise exception 'Disabled manual addon was allowed';end if;

 -- D: Both disabled: neither a new price nor a temporary add-on can pass.
 update public.settings set value='false'::jsonb
  where key='worker_manual_service_enabled';
 v_denied:=false;
 begin
  perform public.carwash_worker_link_record_exception(
   repeat('e',64),p.car_type,p.service_type,p.amount,v_extra,'[]'::jsonb,
   p.amount+3.50,0,0,'QA blocked','كلا الخيارين معطل',
   'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a005'::uuid,null,false);
 exception when others then v_denied:=true;end;
 if not v_denied then raise exception 'Both-disabled policy was bypassed';end if;

 -- A: Both enabled: manual service + custom addon is permitted.
 update public.settings set value='true'::jsonb
  where key in('worker_manual_service_enabled','worker_manual_addon_enabled');
 v_one:=public.carwash_worker_link_record_exception(
  repeat('e',64),p.car_type,'QA تلميع استثنائي',50,v_extra,'[]'::jsonb,
  53.50,0,0,'QA both','اختبار السياستين معا',
  'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a006'::uuid,null,false);
 if not coalesce((v_one->>'ok')::boolean,false)
 then raise exception 'Both-enabled service and addon rejected';end if;
 update public.settings set value=coalesce(v_original_service,'true'::jsonb)
  where key='worker_manual_service_enabled';
 update public.settings set value=coalesce(v_original_addon,'true'::jsonb)
  where key='worker_manual_addon_enabled';
end $independent_addons$;
select 'INDEPENDENT MANUAL SERVICE / ADDON POLICY MATRIX PASSED' as result;
