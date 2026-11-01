# Bright Carwash V2 — isolated staging and launch checklist

## Scope (current branch)
This branch reuses the original Next.js UI and database model, extends the original Apps Script functionality, and does **not** connect to the existing Google Apps Script production sheet. No source workbook or real customer/financial records should be committed to this repository.

## Functions already present (and preserved)
- Fast single/batch wash registration, cash/card/mixed payments, dates, services, price presets, workers/team performer.
- Expenses, workers ledgers, service analytics, day/month reports, Excel export, offline queue.
- Configurable bonus threshold and separate 15:00–04:00 Asia/Riyadh operational shift.
- The new role gate, append-only financial audit, source-aware import and idempotent offline replay. Owner-only user invitations and role administration, and configurable targets and alerts are included.

## Security boundaries
- Create a **dedicated NEW Supabase project** for this deployment. Never reuse the WorkshopOS database.
- Run existing migrations 0001–0010, then 0011–0017 **in sequence on the new project only**. Migration 0015 reconciles salary expenses with worker ledger atomically; 0016 restores target alerts; 0017 closes legacy audit exposure.
- RLS is essential; do not ship until verified by role.
- Disable public signup in Auth configuration and create users privately in Supabase Auth.
- Seed first owner from Supabase SQL Editor (replace placeholder with the verified new Auth email):
  ```sql
  insert into public.app_members(user_id, role, active)
  select id, 'owner', true from auth.users where email = 'owner@example.invalid'
  on conflict (user_id) do update set role = 'owner', active = true;
  ```
- Use the owner-only **Users** tab to invite manager/worker accounts and assign `manager` or `worker` in `app_members`; configure email delivery first. Never use `user_metadata` for roles.
- The original repository is public. Change its GitHub visibility to Private before adding any sensitive files. **Never** commit real API keys, service-role keys, exported spreadsheets, or backups.
- Owner-only settings and backups; manager can administer operations and workers; worker can register and read wash entries, but cannot read expenses, audit logs, or modify finances.

## Migration control
1. Freeze source writes for the final cutover and export the original Google Sheet as XLSX.
2. Run `node scripts/migrate-safe.mjs carwash.xlsx` first (dry run, no DB credentials needed).
3. Review all invalid source rows and monetary discrepancies. Neither is silently discarded or overwritten.
4. After explicit financial approval, run the importer with protected server-only credentials and `--confirm` (and `--approve-mismatches` only if intentionally approved).
5. The importer uses unique `legacy_ref` keys and `ignoreDuplicates` so repeating the same frozen export does not duplicate records.
6. Compare row counts, cash/card splits, reported totals, expenses and per-month results before activating the new site.
7. Keep Google Apps Script and source Sheet unchanged and read-only during the parallel test.

## Backup integrity
- `/api/backup` is secured by a **nonempty** `CRON_SECRET`, pagination prevents the first-1000-rows truncation, and the cloud `backups` bucket must be private.
- Use a verified owner's backup email in settings; configure `RESEND_API_KEY` on the server, never in frontend variables.
- Test a full backup and restore onto an empty test project; do not assume backup is valid merely because email was sent.
- Browser offline localStorage is *not* a permanent backup. Do not clear the browser before the queue is empty.

## Vercel staging project
Project: `bright-carwash-v2-preview` (not yet deployed). Source: this GitHub branch.
Set environment variables in Vercel project settings, with correct environment scoping:
- `NEXT_PUBLIC_SUPABASE_URL` (public project URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/legacy anon key)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side **secret**)
- `CRON_SECRET` (random server-side **secret**)
- `RESEND_API_KEY` (server-side **secret**, only when email backup enabled)
Never commit a `.env.local` file. Protect previews through Vercel Authentication. Point at the **new** Supabase project, not a development database used by another system.

## Verification before go-live
- `npm ci && npm test && npx tsc --noEmit && npm run build`
- Test owner/manager/worker sign-in and denial of unauthorized changes directly through Supabase RLS.
- Reconcile source mismatches and repeated same-minute transactions; test importing the same XLSX twice.
- Test after-midnight shifts (00:30 Riyadh) versus calendar-day reports and bonus threshold.
- Test online, offline, reconnect, replays, and failed sync (no silent loss), including changing user accounts; test alert thresholds after monthly rollover.
- Test record edit/deletion audit, salary linked to workers ledger, expense corrections, backup and restore.
- Test on a mobile phone plus tablet and desktop browser.
- Only after successful staging verification, approve a controlled production cutover.
