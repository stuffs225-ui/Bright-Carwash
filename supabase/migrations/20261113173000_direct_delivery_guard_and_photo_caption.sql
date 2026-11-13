-- Direct worker handoff. New day closures require all active cars delivered.
CREATE OR REPLACE FUNCTION private.require_all_cars_delivered_before_day_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_missing integer;
begin
 if new.status is distinct from old.status
    and new.status in ('awaiting_owner','approved') then
  select count(*) into v_missing
   from public.entries e
   left join public.carwash_entry_readiness r on r.entry_id=e.id
   where e.business_date=new.business_date and e.deleted_at is null
     and coalesce(r.status,'washing')<>'delivered';
  if v_missing>0 then
   raise exception 'لا يمكن إقفال اليوم: توجد % سيارة لم يتم تسليمها',v_missing
     using errcode='P0001';
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.carwash_readiness_action(p_entry_id uuid, p_action text, p_actor_type text, p_actor_user uuid DEFAULT NULL::uuid, p_actor_link uuid DEFAULT NULL::uuid, p_photo_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_date date;v_day_status text;v_status text;
 v_role text;v_link public.carwash_worker_links%rowtype;
 v_now timestamptz:=now();
 v_event_type text;
begin
 if p_entry_id is null or p_action not in('ready','delivered','share_opened','photo_uploaded')
 then raise exception 'Invalid readiness action';end if;
 if p_actor_type='manager' then
  if p_actor_user is null or not exists(
   select 1 from public.app_members where user_id=p_actor_user and role='manager' and active
  ) then raise exception 'Manager authorization required';end if;
  if p_actor_link is not null then raise exception 'Incorrect manager actor';end if;
 elsif p_actor_type='worker' then
  if p_actor_user is not null or p_actor_link is null then
   raise exception 'Worker link required';end if;
  select * into v_link from public.carwash_worker_links where id=p_actor_link;
  if not found or v_link.revoked_at is not null or v_link.expires_at<=v_now
   or not exists(select 1 from public.app_members
      where user_id=v_link.created_by and role='manager' and active)
  then raise exception 'Worker link is no longer active';end if;
 else raise exception 'Invalid actor';end if;
 select e.business_date,d.status into v_date,v_day_status
 from public.entries e
 join public.carwash_days d on d.business_date=e.business_date
 where e.id=p_entry_id and e.deleted_at is null
 for update of e;
 if not found or v_day_status not in ('open','awaiting_owner')
 then raise exception 'Approved or archived car cannot change readiness';end if;
 insert into public.carwash_entry_readiness(entry_id,last_actor,changed_by)
 values(p_entry_id,p_actor_type,p_actor_user)
 on conflict(entry_id) do nothing;
 select status into v_status from public.carwash_entry_readiness
 where entry_id=p_entry_id for update;

 if p_action in ('ready','delivered','share_opened') and v_status='washing' then
  update public.carwash_entry_readiness
   set status='ready',ready_at=v_now,last_actor=p_actor_type,
       changed_by=p_actor_user,updated_at=v_now
   where entry_id=p_entry_id;
  v_status:='ready';
  if p_action='ready' then
   v_event_type:='ready';
  else
   insert into public.carwash_readiness_events(
    entry_id,event_type,actor_type,actor_user,actor_link_id)
   values(p_entry_id,'ready',p_actor_type,p_actor_user,p_actor_link);
  end if;
 end if;
 if p_action='ready' then
  if v_status='delivered' then raise exception 'Delivered car cannot be reopened';end if;
 elsif p_action='delivered' then
  if v_status='ready' then
   update public.carwash_entry_readiness
    set status='delivered',delivered_at=v_now,last_actor=p_actor_type,
        changed_by=p_actor_user,updated_at=v_now
    where entry_id=p_entry_id;
   v_event_type:='delivered';
  end if;
 elsif p_action='share_opened' then
  if v_status<>'ready' then raise exception 'Delivered car cannot be shared again';end if;
  update public.carwash_entry_readiness
   set share_requested_at=v_now,share_sheet_opened_at=v_now,updated_at=v_now
   where entry_id=p_entry_id;
  v_event_type:='share_opened';
 elsif p_action='photo_uploaded' then
  if v_status='delivered' then raise exception 'Delivered car cannot change photo';end if;
  if p_photo_path is null or
   p_photo_path not like 'active/'||p_entry_id::text||'/%'
   or not exists(select 1 from storage.objects
      where bucket_id='carwash-ready-photos' and name=p_photo_path)
  then raise exception 'Private photo object is not verified';end if;
  update public.carwash_entry_readiness
   set photo_path=p_photo_path,updated_at=v_now,last_actor=p_actor_type,
      changed_by=p_actor_user
   where entry_id=p_entry_id;
  v_event_type:='photo_uploaded';
 end if;
 if v_event_type is not null then
  insert into public.carwash_readiness_events(
   entry_id,event_type,actor_type,actor_user,actor_link_id
  ) values(p_entry_id,v_event_type,p_actor_type,p_actor_user,p_actor_link);
 end if;
 select status into v_status from public.carwash_entry_readiness
 where entry_id=p_entry_id;
 return jsonb_build_object('ok',true,'status',v_status,'actionRecorded',v_event_type is not null);
end $function$;

CREATE OR REPLACE FUNCTION public.carwash_undelivered_count(p_date date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select count(*)::integer
 from public.entries e
 left join public.carwash_entry_readiness r on r.entry_id=e.id
 where e.business_date=p_date and e.deleted_at is null
  and coalesce(r.status,'washing')<>'delivered'
$function$;

drop trigger if exists carwash_require_delivered_before_day_close on public.carwash_days;
create trigger carwash_require_delivered_before_day_close
 before update of status on public.carwash_days
 for each row execute function private.require_all_cars_delivered_before_day_close();

revoke all on function public.carwash_undelivered_count(date) from public, anon, authenticated;
grant execute on function public.carwash_undelivered_count(date) to service_role;
