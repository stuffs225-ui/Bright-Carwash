-- Official preset + one-time add-ons must remain available if (and only if)
-- worker_manual_addon_enabled is true, even if manual base service is disabled.
-- Generated from the current live function definition; only scoped policy and
-- immutable snapshot classification change. Does not touch historical rows.
CREATE OR REPLACE FUNCTION public.carwash_worker_link_record_exception(p_link_hash text, p_car_type text, p_service_type text, p_base_price numeric, p_manual_addons jsonb, p_addon_ids jsonb, p_cash numeric, p_card numeric, p_discount numeric, p_notes text, p_price_reason text, p_mutation_id uuid, p_customer_phone text, p_whatsapp_consent boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_link public.carwash_worker_links%rowtype;
 v_today date;
 v_existing uuid;
 v_id uuid;
 v_recent int;v_daily int;
 v_limit numeric;
 v_enabled boolean;
 v_allow_addon boolean;
 v_is_official boolean:=false;
 v_addon jsonb;
 v_catalog text;
 v_official_addon numeric(12,2):=0;
 v_custom_addon numeric(12,2):=0;
 v_price numeric(12,2);
 v_car text:=trim(p_car_type);
 v_service text:=trim(p_service_type);
begin
 if p_link_hash is null or p_link_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'Invalid worker link';end if;
 select * into v_link from public.carwash_worker_links
  where token_hash=p_link_hash for update;
 if not found or v_link.revoked_at is not null or v_link.expires_at<=now()
 then raise exception 'Worker link inactive or expired';end if;
 if not exists(select 1 from public.app_members
   where user_id=v_link.created_by and role='manager' and active)
 then raise exception 'Manager account inactive';end if;
 select entry_id into v_existing from public.carwash_worker_link_submissions
  where client_mutation_id=p_mutation_id and link_id=v_link.id;
 if found then
  return jsonb_build_object('ok',true,'id',v_existing,'duplicate',true);
 end if;
 select coalesce((select value::text::numeric from public.settings
  where key='worker_discount_max'),10) into v_limit;
 select coalesce((select (value::text)::boolean from public.settings
  where key='worker_manual_service_enabled'),true) into v_enabled;
 select coalesce((select (value::text)::boolean from public.settings
  where key='worker_manual_addon_enabled'),true) into v_allow_addon;
 -- A temporary add-on to an official active tariff is NOT manual base pricing.
 -- Keep the two manager policies independent and enforce both in the database.
 select exists (
  select 1 from public.entry_presets p
  where p.active and p.car_type=v_car and p.service_type=v_service
    and p.amount=p_base_price
 ) into v_is_official;
 if not v_enabled and not (
  v_allow_addon and v_is_official and
  coalesce(p_manual_addons,'[]'::jsonb)<>'[]'::jsonb
 ) then raise exception 'Manual pricing disabled';end if;
 if p_mutation_id is null or length(v_car) not between 2 and 80
  or length(v_service) not between 2 and 80 then
  raise exception 'Invalid custom service';end if;
 if not exists(select 1 from public.car_types where name=v_car and active)
 then raise exception 'Inactive car type';end if;
 if p_base_price is null or p_base_price<=0 or p_base_price>5000
  or p_base_price<>round(p_base_price,2) then
  raise exception 'Invalid manual base price';end if;
 if p_discount is null or p_discount<0 or p_discount>v_limit
  or p_discount<>round(p_discount,2) then
  raise exception 'Invalid manual discount';end if;
 if p_cash is null or p_card is null or p_cash<0 or p_card<0
  or p_cash>100000 or p_card>100000 or
  p_cash<>round(p_cash,2) or p_card<>round(p_card,2) then
  raise exception 'Invalid payment';end if;
 if p_customer_phone is not null and p_customer_phone !~ '^\+9665[0-9]{8}$'
 then raise exception 'Invalid customer phone';end if;
 if p_whatsapp_consent and p_customer_phone is null
 then raise exception 'Customer consent requires phone';end if;
 if length(coalesce(p_notes,''))>500 then raise exception 'Notes too long';end if;
 if length(trim(coalesce(p_price_reason,'')))<3
 then raise exception 'Manual price requires reason';end if;
 if p_manual_addons is null or jsonb_typeof(p_manual_addons)<>'array'
  or jsonb_array_length(p_manual_addons)>8 then
  raise exception 'Invalid manual add-ons';end if;
 if jsonb_array_length(p_manual_addons)>0 and not v_allow_addon then
  raise exception 'Manual addons disabled';end if;
 for v_addon in select value from jsonb_array_elements(p_manual_addons) loop
  if jsonb_typeof(v_addon)<>'object'
   or length(trim(coalesce(v_addon->>'name',''))) not between 2 and 80
   or (v_addon->>'price') is null
   or (v_addon->>'price') !~ '^[0-9]{1,4}(\.[0-9]{1,2})?$' then
   raise exception 'Invalid manual add-on';end if;
  v_custom_addon:=v_custom_addon+(v_addon->>'price')::numeric;
 end loop;
 if p_addon_ids is null or jsonb_typeof(p_addon_ids)<>'array'
  or jsonb_array_length(p_addon_ids)>8 then
  raise exception 'Invalid catalog addons';end if;
 if (select count(*) from jsonb_array_elements_text(p_addon_ids))<>
    (select count(distinct value) from jsonb_array_elements_text(p_addon_ids)) then
  raise exception 'Duplicate catalog addons';end if;
 for v_catalog in select value from jsonb_array_elements_text(p_addon_ids) loop
  if v_catalog !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  then raise exception 'Invalid addon ID';end if;
  select a.price into v_price from public.carwash_addons a
   where id=v_catalog::uuid and active for share;
  if not found then raise exception 'Inactive add-on';end if;
  v_official_addon:=v_official_addon+v_price;
 end loop;
 if round(p_cash+p_card+p_discount,2)<>
    round(p_base_price+v_official_addon+v_custom_addon,2)
 then raise exception 'Payment does not match manual price';end if;
 v_today:=(now() at time zone 'Asia/Riyadh')::date;
 select count(*) into v_daily from public.carwash_worker_link_submissions
  where link_id=v_link.id and
   (submitted_at at time zone 'Asia/Riyadh')::date=v_today;
 select count(*) into v_recent from public.carwash_worker_link_submissions
  where link_id=v_link.id and submitted_at>now()-interval '60 seconds';
 if v_daily>=v_link.daily_limit or v_recent>=12
 then raise exception 'Worker rate limit reached';end if;
 perform set_config('request.jwt.claim.sub',v_link.created_by::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.entries(
  car_type,service_type,cash_paid,card_paid,discount_amount,addon_ids,
  one_time_service_name,one_time_base_price,one_time_addons,one_time_reason,
  customer_phone,whatsapp_consent,sms_consent,notes,occurred_at,created_by,client_mutation_id
 ) values(
  v_car,v_service,p_cash,p_card,p_discount,p_addon_ids,
  case when v_is_official then null else v_service end,
  case when v_is_official then null else p_base_price end,
  p_manual_addons,trim(p_price_reason),
  p_customer_phone,coalesce(p_whatsapp_consent,false),false,p_notes,now(),
  v_link.created_by,p_mutation_id::text
 ) returning id into v_id;
 insert into public.carwash_worker_link_submissions(link_id,entry_id,client_mutation_id)
 values(v_link.id,v_id,p_mutation_id);
 update public.carwash_worker_links set last_used_at=now() where id=v_link.id;
 return jsonb_build_object('ok',true,'id',v_id,'duplicate',false);
end $function$;

-- The Next.js backend invokes this via a service-role client after verifying
-- the worker capability. No direct RPC call is needed from browser roles.
REVOKE EXECUTE ON FUNCTION public.carwash_worker_link_record_exception(
 text,text,text,numeric,jsonb,jsonb,numeric,numeric,numeric,text,text,uuid,text,boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carwash_worker_link_record_exception(
 text,text,text,numeric,jsonb,jsonb,numeric,numeric,numeric,text,text,uuid,text,boolean
) TO service_role;
