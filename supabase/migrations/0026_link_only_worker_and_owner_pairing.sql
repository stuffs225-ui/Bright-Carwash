-- Bright Carwash V2: preserve all existing production data.
-- This is version-control parity for the additive migration already applied
-- to the isolated project qsobrjtfyofmjeswktvb.
create table if not exists public.carwash_worker_links (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 label text not null check(length(label) between 1 and 80),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 daily_limit integer not null default 250 check(daily_limit between 1 and 500),
 last_used_at timestamptz
);
create index if not exists carwash_worker_links_created_by_idx
 on public.carwash_worker_links(created_by,created_at desc);
alter table public.carwash_worker_links enable row level security;
revoke all on public.carwash_worker_links from public,anon,authenticated;
grant select,insert,update,delete on public.carwash_worker_links to service_role;
create table if not exists public.carwash_worker_link_submissions (
 id uuid primary key default gen_random_uuid(),
 link_id uuid not null references public.carwash_worker_links(id),
 entry_id uuid not null unique references public.entries(id),
 client_mutation_id uuid not null unique,
 submitted_at timestamptz not null default now()
);
create index if not exists carwash_worker_link_submissions_daily_idx
 on public.carwash_worker_link_submissions(link_id,submitted_at desc);
alter table public.carwash_worker_link_submissions enable row level security;
revoke all on public.carwash_worker_link_submissions from public,anon,authenticated;
grant select,insert,update,delete on public.carwash_worker_link_submissions to service_role;
create table if not exists public.carwash_owner_activation_links (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 owner_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 used_at timestamptz
);
alter table public.carwash_owner_activation_links enable row level security;
revoke all on public.carwash_owner_activation_links from public,anon,authenticated;
grant select,insert,update,delete on public.carwash_owner_activation_links to service_role;
create table if not exists public.carwash_owner_devices (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 owner_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 last_used_at timestamptz,
 revoked_at timestamptz
);
create index if not exists carwash_owner_devices_owner_idx
 on public.carwash_owner_devices(owner_user_id);
alter table public.carwash_owner_devices enable row level security;
revoke all on public.carwash_owner_devices from public,anon,authenticated;
grant select,insert,update,delete on public.carwash_owner_devices to service_role;

CREATE OR REPLACE FUNCTION public.carwash_worker_link_record(p_link_hash text, p_preset_id uuid, p_cash numeric, p_card numeric, p_discount numeric, p_notes text, p_client_mutation_id uuid, p_addon_ids jsonb DEFAULT '[]'::jsonb, p_customer_phone text DEFAULT NULL::text, p_whatsapp_consent boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_link public.carwash_worker_links%rowtype;
 v_preset public.entry_presets%rowtype;
 v_today date;
 v_count integer;
 v_recent integer;
 v_addon text;
 v_addon_count integer;
 v_addon_distinct integer;
 v_price numeric;
 v_extra numeric:=0;
 v_entry uuid;
 v_existing uuid;
begin
 if p_link_hash is null or p_link_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'Invalid worker link'; end if;
 select * into v_link from public.carwash_worker_links
 where token_hash=p_link_hash for update;
 if not found or v_link.revoked_at is not null or v_link.expires_at<=now()
 then raise exception 'Worker link inactive or expired'; end if;
 if not exists (
 select 1 from public.app_members m
 where m.user_id=v_link.created_by and m.role='manager' and m.active=true
 ) then raise exception 'Manager account inactive'; end if;
 if p_client_mutation_id is null then raise exception 'Missing request id'; end if;
 select entry_id into v_existing from public.carwash_worker_link_submissions
 where client_mutation_id=p_client_mutation_id and link_id=v_link.id;
 if found then return jsonb_build_object('ok',true,'id',v_existing,'duplicate',true); end if;
 v_today := (now() at time zone 'Asia/Riyadh')::date;
 select count(*) into v_count from public.carwash_worker_link_submissions s
 where s.link_id=v_link.id and (s.submitted_at at time zone 'Asia/Riyadh')::date=v_today;
 if v_count>=v_link.daily_limit then raise exception 'Daily worker link limit reached';end if;
 select count(*) into v_recent from public.carwash_worker_link_submissions s
 where s.link_id=v_link.id and s.submitted_at>now()-interval '60 seconds';
 if v_recent>=12 then raise exception 'Too many new registrations';end if;
 if p_cash is null or p_card is null or p_discount is null or
    p_cash<0 or p_card<0 or p_discount<0 or p_discount>10 or
    p_cash>100000 or p_card>100000 or
    p_cash<>round(p_cash,2) or p_card<>round(p_card,2) or p_discount<>round(p_discount,2)
 then raise exception 'Invalid payment or discount';end if;
 if p_notes is not null and length(p_notes)>500 then raise exception 'Notes too long';end if;
 if p_customer_phone is not null and p_customer_phone !~ '^\\+9665[0-9]{8}$'
 then raise exception 'Invalid Saudi customer phone';end if;
 if p_whatsapp_consent and p_customer_phone is null then
 raise exception 'Customer phone and consent required';end if;
 select * into v_preset from public.entry_presets where id=p_preset_id and active=true;
 if not found then raise exception 'Inactive service preset';end if;
 if p_addon_ids is null or jsonb_typeof(p_addon_ids)<>'array' or jsonb_array_length(p_addon_ids)>8
 then raise exception 'Invalid add-ons';end if;
 select count(*),count(distinct value) into v_addon_count,v_addon_distinct
 from jsonb_array_elements_text(p_addon_ids);
 if v_addon_count<>v_addon_distinct then raise exception 'Duplicate add-ons';end if;
 for v_addon in select value from jsonb_array_elements_text(p_addon_ids) loop
  if v_addon !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  then raise exception 'Invalid add-on id';end if;
  select a.price into v_price from public.carwash_addons a
  where a.id=v_addon::uuid and a.active=true;
  if not found then raise exception 'Inactive add-on';end if;
  v_extra:=v_extra+v_price;
 end loop;
 if round(p_cash+p_card+p_discount,2)<>round(v_preset.amount+v_extra,2)
 then raise exception 'Payment does not match approved price';end if;
 -- Existing business-date/price/audit triggers still run on the canonical entries table.
 -- Set the trusted manager identity for this scoped service_role RPC, and never
 -- hand any Supabase JWT or Auth credentials to a worker link.
 perform set_config('request.jwt.claim.sub',v_link.created_by::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.entries(
 car_type,service_type,cash_paid,card_paid,discount_amount,addon_ids,
 customer_phone,whatsapp_consent,sms_consent,notes,occurred_at,
 created_by,client_mutation_id
 ) values (
 v_preset.car_type,v_preset.service_type,p_cash,p_card,p_discount,p_addon_ids,
 p_customer_phone,coalesce(p_whatsapp_consent,false),false,p_notes,now(),
 v_link.created_by,p_client_mutation_id::text
 ) returning id into v_entry;
 insert into public.carwash_worker_link_submissions(link_id,entry_id,client_mutation_id)
 values(v_link.id,v_entry,p_client_mutation_id);
 update public.carwash_worker_links set last_used_at=now() where id=v_link.id;
 return jsonb_build_object('ok',true,'id',v_entry,'duplicate',false);
end
$function$

revoke all on function public.carwash_worker_link_record(
 text,uuid,numeric,numeric,numeric,text,uuid,jsonb,text,boolean
) from public,anon,authenticated;
grant execute on function public.carwash_worker_link_record(
 text,uuid,numeric,numeric,numeric,text,uuid,jsonb,text,boolean
) to service_role;
