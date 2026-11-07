-- Read-only manager insight: historical prices are candidates, NOT approved prices.
create or replace function public.carwash_price_candidates(p_limit integer default 40)
returns table(car_type text,service_type text,base_price numeric,usage_count bigint,last_used timestamptz,is_approved boolean)
language plpgsql stable security definer set search_path='' as $function$
begin
 if private.current_app_role()<>'owner' then
  raise exception 'Manager required to review archived pricing';end if;
 return query
 select e.car_type,e.service_type,
  round((e.cash_paid+e.card_paid+e.discount_amount-e.addon_total)::numeric,2) price,
  count(*)::bigint,max(e.occurred_at),
  exists(select 1 from public.entry_presets p
    where p.active and p.car_type=e.car_type
    and p.service_type=e.service_type
    and p.amount=round((e.cash_paid+e.card_paid+e.discount_amount-e.addon_total)::numeric,2))
 from public.entries e
 where e.deleted_at is null and e.one_time_service_name is null
  and e.discount_amount=0 and e.cash_paid+e.card_paid>0
  and e.cash_paid+e.card_paid-e.addon_total>0
 group by e.car_type,e.service_type,
  round((e.cash_paid+e.card_paid+e.discount_amount-e.addon_total)::numeric,2)
 order by count(*) desc,max(e.occurred_at) desc
 limit least(greatest(coalesce(p_limit,40),1),100);
end $function$;
revoke all on function public.carwash_price_candidates(integer) from public,anon;
grant execute on function public.carwash_price_candidates(integer) to authenticated;
