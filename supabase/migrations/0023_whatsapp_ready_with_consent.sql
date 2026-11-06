-- Carwash WhatsApp-ready notifications. No Meta account is connected by SQL.
-- Consent is explicitly to WhatsApp, not recycled from earlier SMS consent.

begin;
alter table public.entries
 add column if not exists whatsapp_consent boolean not null default false;
alter table public.ready_sms_outbox
 add column if not exists channel text not null default 'whatsapp',
 add column if not exists attempt_count integer not null default 0,
 add column if not exists claimed_at timestamptz,
 add column if not exists delivered_at timestamptz;
alter table public.ready_sms_outbox
 drop constraint if exists ready_sms_outbox_status_check;
alter table public.ready_sms_outbox
 add constraint ready_sms_outbox_status_check check(
 status in('pending_provider','queued','sent','delivered','failed','unknown')
);
alter table public.ready_sms_outbox
 add constraint carwash_ready_channel_check check(channel='whatsapp');

create index if not exists carwash_ready_pending_channel
 on public.ready_sms_outbox(created_at,id)
 where status='pending_provider' and channel='whatsapp';

create or replace function public.request_ready_notice(
 p_entry_id uuid default null,
 p_client_mutation_id text default null
) returns text language plpgsql security definer set search_path=''
as $carwash_ready_whatsapp$
declare v_role text; v_entry public.entries%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required';end if;
 v_role:=private.current_app_role();
 if v_role not in ('owner','manager','worker') or v_role is null
 then raise exception 'Carwash membership required';end if;
 if p_entry_id is null and p_client_mutation_id is null
 then raise exception 'Entry identifier required';end if;

 select * into v_entry from public.entries
 where deleted_at is null
  and (id=p_entry_id or (p_client_mutation_id is not null
    and client_mutation_id=p_client_mutation_id))
 for update;
 if not found then raise exception 'Synced entry not found';end if;
 if v_role='worker' and v_entry.created_by is distinct from (select auth.uid())
 then raise exception 'Cannot mark another account entry ready';end if;
 if v_entry.ready_at is not null then return 'already_ready';end if;

 update public.entries set ready_at=now() where id=v_entry.id;
 if v_entry.customer_phone is null or not v_entry.whatsapp_consent
 then return 'ready_no_whatsapp';end if;
 insert into public.ready_sms_outbox(
  entry_id,destination_phone,created_by,channel,status
 ) values(
  v_entry.id,v_entry.customer_phone,(select auth.uid()),
  'whatsapp','pending_provider'
 ) on conflict(entry_id) do nothing;
 return 'pending_provider';
end
$carwash_ready_whatsapp$;
revoke all on function public.request_ready_notice(uuid,text)
 from PUBLIC,anon;
grant execute on function public.request_ready_notice(uuid,text)
 to authenticated;

-- Only the trusted backend may reserve unsent notices for Meta API.
-- Reserved notices are deliberately never auto-resubmitted after an
-- ambiguous network timeout, protecting customers from duplicate WhatsApps.
create or replace function public.carwash_claim_whatsapp_ready(p_limit int default 10)
returns table(outbox_id uuid,destination_phone text)
language plpgsql security definer set search_path=''
as $carwash_claim_whatsapp$
begin
 if p_limit<1 or p_limit>50 then
  raise exception 'Limit must be 1..50';end if;
 return query
 with picked as(
  select id from public.ready_sms_outbox
  where status='pending_provider' and channel='whatsapp'
  order by created_at,id for update skip locked limit p_limit
 )
 update public.ready_sms_outbox o set
  status='queued',claimed_at=now(),attempt_count=attempt_count+1
 from picked p where o.id=p.id
 returning o.id,o.destination_phone;
end
$carwash_claim_whatsapp$;
revoke all on function public.carwash_claim_whatsapp_ready(int)
 from PUBLIC,anon,authenticated;
grant execute on function public.carwash_claim_whatsapp_ready(int)
 to service_role;

create or replace function public.carwash_complete_whatsapp_ready(
 p_id uuid,p_status text,p_message_id text default null,p_error text default null
) returns boolean language plpgsql security definer set search_path=''
as $carwash_complete_whatsapp$
begin
 if p_status not in('sent','failed','unknown')
 then raise exception 'Invalid provider result';end if;
 update public.ready_sms_outbox set
  status=p_status,
  provider_message_id=case when p_status='sent' then p_message_id else null end,
  sent_at=case when p_status='sent' then now() else null end,
  last_error=case when p_status='sent' then null else left(coalesce(p_error,'Provider response unknown'),250) end
 where id=p_id and status='queued';
 return found;
end
$carwash_complete_whatsapp$;
revoke all on function public.carwash_complete_whatsapp_ready(uuid,text,text,text)
 from PUBLIC,anon,authenticated;
grant execute on function public.carwash_complete_whatsapp_ready(uuid,text,text,text)
 to service_role;

commit;
