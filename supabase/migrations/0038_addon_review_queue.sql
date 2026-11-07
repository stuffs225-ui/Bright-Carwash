-- Candidate only: 13 expense notes mention wax; this does NOT establish
-- that car-wax was sold as an extra or establish any price.
create table if not exists public.carwash_addon_proposals(
 id uuid primary key default gen_random_uuid(),
 name text not null unique check(length(trim(name)) between 2 and 80),
 evidence text not null,
 status text not null default 'needs_review'
  check(status in('needs_review','approved','dismissed')),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 approved_addon_id uuid references public.carwash_addons(id),
 created_at timestamptz not null default now()
);
alter table public.carwash_addon_proposals enable row level security;
revoke all on public.carwash_addon_proposals from anon;
grant select,update on public.carwash_addon_proposals to authenticated;
create policy carwash_manager_addon_proposals_read on public.carwash_addon_proposals
 for select to authenticated using(private.current_app_role() in('owner','manager'));
create policy carwash_manager_addon_proposals_update on public.carwash_addon_proposals
 for update to authenticated using(private.current_app_role() in('owner','manager'))
 with check(private.current_app_role() in('owner','manager'));
insert into public.carwash_addon_proposals(name,evidence)
select 'واكس','ورد في وصف مصروفات المواد؛ لا توجد خدمة إضافية مباعة مثبتة ولا سعر رسمي.'
where exists(select 1 from public.expenses where deleted_at is null
 and notes ilike '%واكس%')
on conflict(name) do nothing;
