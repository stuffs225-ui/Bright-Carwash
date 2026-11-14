-- Optional worker contact/profile fields. Existing worker financial records remain intact.
alter table public.workers
 add column if not exists phone text,
 add column if not exists job_title text,
 add column if not exists joined_on date;
alter table public.workers
 add constraint carwash_worker_phone_length check(phone is null or length(phone)<=25),
 add constraint carwash_worker_job_title_length check(job_title is null or length(job_title)<=80);
