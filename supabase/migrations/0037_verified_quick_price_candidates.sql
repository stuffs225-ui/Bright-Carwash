-- Only repeated, recently used, non-discounted historical prices.
-- Manually reviewed 2026-11-07: four additional operational choices.
-- This DOES NOT UPDATE imported entries, amounts, or existing presets.
with candidates(car_type,service_type,amount,minimum_count,rank_order) as (
 values
  ('سيارة صغيرة','غسيل خارجي',10.00::numeric,100,5),
  ('سيارة صغيرة','غسيل بستم',40.00::numeric,40,6),
  ('سيارة كبيرة','غسيل كامل',35.00::numeric,80,5),
  ('سيارة كبيرة','غسيل بستم',50.00::numeric,45,6)
),
verified as(
 select c.car_type,c.service_type,c.amount,c.rank_order
 from candidates c
 join public.car_types ct on ct.name=c.car_type and ct.active
 join public.service_types st on st.name=c.service_type and st.active
 join public.entries e on e.car_type=c.car_type and e.service_type=c.service_type
  and e.cash_paid+e.card_paid=c.amount
  and e.discount_amount=0 and e.addon_total=0
  and e.legacy_ref is not null and e.deleted_at is null
 group by c.car_type,c.service_type,c.amount,c.rank_order,c.minimum_count
 having count(*)>=max(c.minimum_count)
   and max(e.occurred_at)>='2026-10-01'::timestamptz
)
insert into public.entry_presets(car_type,service_type,amount,sort_order,active)
select v.car_type,v.service_type,v.amount,v.rank_order,true
from verified v
where not exists(
 select 1 from public.entry_presets p
 where p.car_type=v.car_type and p.service_type=v.service_type and p.amount=v.amount
);
