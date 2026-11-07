-- Bright Carwash V2: additive extension only. NO changes to historic entries or expenses.
-- Adds audited one-time price/service line snapshots and secure readiness workflow.
insert into public.settings(key,value) values
 ('worker_manual_service_enabled','true'::jsonb),
 ('worker_manual_addon_enabled','true'::jsonb),
 ('worker_discount_max','10'::jsonb),
 ('whatsapp_ready_text',to_jsonb('مرحبًا، سيارتك جاهزة للاستلام من مغسلة سيارتك اللامعة. شكرًا لزيارتك ونتشرف بخدمتك دائمًا.'::text)),
 ('ready_photo_retention_days','30'::jsonb)
on conflict(key) do nothing;

alter table public.entries
 add column if not exists one_time_service_name text,
 add column if not exists one_time_base_price numeric(12,2),
 add column if not exists one_time_addons jsonb not null default '[]'::jsonb,
 add column if not exists one_time_reason text;

alter table public.entries
 add constraint carwash_one_time_service_name_limit check
 (one_time_service_name is null or length(trim(one_time_service_name)) between 2 and 80),
 add constraint carwash_one_time_base_positive check
 (one_time_base_price is null or (one_time_base_price>0 and one_time_base_price<=5000)),
 add constraint carwash_one_time_addons_array check
 (jsonb_typeof(one_time_addons)='array' and jsonb_array_length(one_time_addons)<=8);

-- Each line stores the actual approved/exceptional amount at entry time,
-- never the latest live catalog price. Soft-delete/edit audit remains on entries.
create table if not exists public.carwash_entry_line_items(
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null references public.entries(id) on delete restrict,
 line_no integer not null check(line_no>=1 and line_no<=20),
 category text not null check(category in ('base','addon','manual_addon','discount')),
 label text not null check(length(label) between 1 and 120),
 amount numeric(12,2) not null,
 catalog_id uuid,
 created_at timestamptz not null default now(),
 unique(entry_id,line_no)
);
alter table public.carwash_entry_line_items enable row level security;
create index if not exists carwash_entry_line_items_entry_idx on public.carwash_entry_line_items(entry_id);
revoke all on public.carwash_entry_line_items from anon;
grant select on public.carwash_entry_line_items to authenticated;
create policy manager_read_carwash_entry_line_items on public.carwash_entry_line_items
 for select to authenticated using(private.current_app_role() in ('owner','manager'));

create or replace function private.snapshot_carwash_entry_lines()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
 v_line integer:=1;
 v_catalog text;
 v_id uuid;
 v_name text;
 v_amount numeric(12,2);
 v_manual jsonb;
 v_manual_sum numeric(12,2):=0;
 v_addon_sum numeric(12,2):=0;
 v_base numeric(12,2);
begin
 if NEW.legacy_ref is not null then return NEW;end if;
 if NEW.one_time_addons is not null then
  for v_manual in select value from jsonb_array_elements(NEW.one_time_addons) loop
   if jsonb_typeof(v_manual)<>'object'
    or trim(coalesce(v_manual->>'name',''))=''
    or length(v_manual->>'name')>80
    or (v_manual->>'price') is null
    or (v_manual->>'price') !~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
   then raise exception 'Invalid manual add-on snapshot';end if;
   v_amount:=(v_manual->>'price')::numeric;
   if v_amount<=0 or v_amount>5000 then raise exception 'Invalid manual add-on price';end if;
   v_manual_sum:=v_manual_sum+v_amount;
  end loop;
 end if;
 v_base:=coalesce(NEW.one_time_base_price,
     NEW.cash_paid+NEW.card_paid+NEW.discount_amount-NEW.addon_total-v_manual_sum);
 if v_base<=0 then raise exception 'Invalid base price snapshot';end if;
 if round(v_base+NEW.addon_total+v_manual_sum-NEW.discount_amount,2)
    <>round(NEW.cash_paid+NEW.card_paid,2) then
  raise exception 'Snapshot pricing does not match money received';end if;
 insert into public.carwash_entry_line_items(entry_id,line_no,category,label,amount)
 values(NEW.id,v_line,'base',
    coalesce(nullif(NEW.one_time_service_name,''),NEW.service_type),v_base);
 v_line:=v_line+1;
 if NEW.addon_ids is not null and jsonb_typeof(NEW.addon_ids)='array' then
  for v_catalog in select value from jsonb_array_elements_text(NEW.addon_ids) loop
   select a.id,a.name,a.price into v_id,v_name,v_amount
   from public.carwash_addons a where a.id=v_catalog::uuid;
   if not found then raise exception 'Add-on no longer exists';end if;
   v_addon_sum:=v_addon_sum+v_amount;
   insert into public.carwash_entry_line_items(entry_id,line_no,category,label,amount,catalog_id)
    values(NEW.id,v_line,'addon',v_name,v_amount,v_id);
   v_line:=v_line+1;
  end loop;
 end if;
 if v_addon_sum<>NEW.addon_total then
   raise exception 'Catalog addon snapshot is inconsistent';end if;
 if NEW.one_time_addons is not null then
  for v_manual in select value from jsonb_array_elements(NEW.one_time_addons) loop
   insert into public.carwash_entry_line_items(entry_id,line_no,category,label,amount)
   values(NEW.id,v_line,'manual_addon',v_manual->>'name',(v_manual->>'price')::numeric);
   v_line:=v_line+1;
  end loop;
 end if;
 if NEW.discount_amount>0 then
  insert into public.carwash_entry_line_items(entry_id,line_no,category,label,amount)
   values(NEW.id,v_line,'discount','خصم',-NEW.discount_amount);
 end if;
 return NEW;
end
$function$;
drop trigger if exists carwash_capture_entry_snapshot on public.entries;
create trigger carwash_capture_entry_snapshot
 after insert on public.entries for each row execute function private.snapshot_carwash_entry_lines();

create table if not exists public.carwash_entry_readiness(
 entry_id uuid primary key references public.entries(id) on delete restrict,
 status text not null default 'washing' check(status in ('washing','ready','delivered')),
 ready_at timestamptz,
 delivered_at timestamptz,
 photo_path text,
 share_requested_at timestamptz,
 share_sheet_opened_at timestamptz,
 last_actor text not null default 'worker' check(last_actor in ('worker','manager')),
 changed_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.carwash_entry_readiness enable row level security;
revoke all on public.carwash_entry_readiness from anon;
grant select on public.carwash_entry_readiness to authenticated;
create policy manager_read_carwash_readiness on public.carwash_entry_readiness
 for select to authenticated using(private.current_app_role() in ('owner','manager'));

create table if not exists public.carwash_readiness_events(
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null references public.entries(id) on delete restrict,
 event_type text not null check(event_type in ('ready','delivered','share_opened','photo_uploaded')),
 actor_type text not null check(actor_type in ('worker','manager')),
 actor_user uuid references auth.users(id),
 actor_link_id uuid references public.carwash_worker_links(id),
 created_at timestamptz not null default now(),
 meta jsonb not null default '{}'::jsonb
);
alter table public.carwash_readiness_events enable row level security;
revoke all on public.carwash_readiness_events from anon;
grant select on public.carwash_readiness_events to authenticated;
create policy manager_read_carwash_ready_events on public.carwash_readiness_events
 for select to authenticated using(private.current_app_role() in ('owner','manager'));
create index if not exists carwash_readiness_events_entry_idx on public.carwash_readiness_events(entry_id,created_at);

insert into storage.buckets(id,name,public)
 values('carwash-ready-photos','carwash-ready-photos',false)
on conflict(id) do nothing;

-- Worker exception writes are only possible through this service_role-only RPC.
-- This function intentionally does not create permanent presets or change prices.
create or replace function public.carwash_worker_link_record_exception(
 p_link_hash text,p_car_type text,p_service_type text,p_base_price numeric,
 p_manual_addons jsonb,p_addon_ids jsonb,
 p_cash numeric,p_card numeric,p_discount numeric,p_notes text,
 p_price_reason text,p_mutation_id uuid,p_customer_phone text,
 p_whatsapp_consent boolean
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_link public.carwash_worker_links%rowtype;
 v_today date;
 v_existing uuid;
 v_id uuid;
 v_recent int;v_daily int;
 v_limit numeric;
 v_enabled boolean;
 v_allow_addon boolean;
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
 if not v_enabled then raise exception 'Manual pricing disabled';end if;
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
  v_service,p_base_price,p_manual_addons,trim(p_price_reason),
  p_customer_phone,coalesce(p_whatsapp_consent,false),false,p_notes,now(),
  v_link.created_by,p_mutation_id::text
 ) returning id into v_id;
 insert into public.carwash_worker_link_submissions(link_id,entry_id,client_mutation_id)
 values(v_link.id,v_id,p_mutation_id);
 update public.carwash_worker_links set last_used_at=now() where id=v_link.id;
 return jsonb_build_object('ok',true,'id',v_id,'duplicate',false);
end $function$;
revoke all on function public.carwash_worker_link_record_exception(
text,text,text,numeric,jsonb,jsonb,numeric,numeric,numeric,text,text,uuid,text,boolean)
 from public,anon,authenticated;
grant execute on function public.carwash_worker_link_record_exception(
text,text,text,numeric,jsonb,jsonb,numeric,numeric,numeric,text,text,uuid,text,boolean)
 to service_role;
