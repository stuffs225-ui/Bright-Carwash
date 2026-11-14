-- Optional worker contact/profile fields. Existing worker financial records remain intact.
alter table public.workers
 add column if not exists phone text,
 add column if not exists job_title text,
 add column if not exists joined_on date;
alter table public.workers
 add constraint carwash_worker_phone_length check(phone is null or length(phone)<=25),
 add constraint carwash_worker_job_title_length check(job_title is null or length(job_title)<=80);

-- Worker roster contains private contact information; only managers/owners
-- may read profiles. Shared worker registration uses its dedicated API.
alter policy staff_read_workers on public.workers to authenticated
 using (private.current_app_role() in ('manager','owner'));
