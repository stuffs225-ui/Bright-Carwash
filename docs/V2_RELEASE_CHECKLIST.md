# Bright Carwash V2 — isolated staging and launch checklist

## Scope (current branch)
This branch reuses the original Next.js UI and database model, extends the original Apps Script functionality, and does **not** connect to the existing Google Apps Script production sheet. No source workbook or real customer/financial records should be committed to this repository.

## Functions already present (and preserved)
- Fast single/batch wash registration, cash/card/mixed payments, dates, services, price presets, workers/team performer.
- Expenses, workers ledgers, service analytics, day/month reports, Excel export, offline queue.
- SAR 10 crew-wide provision per paid vehicle; the old bonus above 15 cars is FROZEN, not calculated. The 15:00–04:00 Asia/Riyadh operational shift remains separate from calendar-day reports.
- The new role gate, append-only financial audit, source-aware import and idempotent offline replay. Owner-only phone-number provisioning and role administration, configurable targets and alerts, source row reconciliation and worker/team hourly rates are included.

## Security boundaries
- Create a **dedicated NEW Supabase project** for this deployment. Never reuse a database or secrets from an unrelated application.
- Run existing migrations 0001–0010, then 0011–0019 **in sequence on the new project only**. Migration 0015 reconciles salary expenses with worker ledger atomically; 0016 restores target alerts; 0017 closes legacy audit exposure; 0018/0019 preserve original rows and audit reconciliation decisions.
- RLS is essential; do not ship until verified by role.
- Disable public signup in Auth configuration and create users privately in Supabase Auth.
- Seed first owner from Supabase SQL Editor using the verified Auth user phone identity, after creation of a PRIVATE isolated carwash project:
  ```sql
  insert into public.app_members(user_id, role, active)
  select id, 'owner', true from auth.users where phone = '+9665XXXXXXXX'
  on conflict (user_id) do update set role = 'owner', active = true;
  ```
- Use the owner-only **Users** tab to pre-create allowlisted Saudi phone accounts for manager/worker accounts and assign `manager` or `worker` in `app_members`; configure an SMS provider and disable public signup before testing. Never use `user_metadata` for roles.
- The original repository is public. Change its GitHub visibility to Private before adding any sensitive files. **Never** commit real API keys, service-role keys, exported spreadsheets, or backups.
- Owner-only settings and backups; manager can administer operations and workers; the shared worker account can read only entries created by that account, but not owner/manager entries, expenses or financial audit logs. Its insert discount is capped by a database RLS policy at SAR 10.

## Migration control
1. Freeze source writes for the final cutover and export the original Google Sheet as XLSX.
2. Run `node scripts/migrate-safe.mjs carwash.xlsx` first (dry run, no DB credentials needed). If any source rows cannot be financially classified, they must be quarantined as `legacy_source_rows`/`legacy_import_issues` using the explicitly acknowledged `--accept-pending-review` workflow, not silently dropped.
3. Review all invalid source rows and monetary discrepancies. Neither is silently discarded or overwritten.
4. After explicit financial approval, run the importer with protected server-only credentials and `--confirm` (plus `--accept-pending-review` and `--approve-mismatches` only if explicitly accepted). Every row is preserved as raw source evidence while only valid operations enter live financial totals.
5. The importer uses unique `legacy_ref` keys and `ignoreDuplicates` so repeating the same frozen export does not duplicate records.
6. Compare row counts, cash/card splits, reported totals, expenses and per-month results before activating the new site.
7. Keep Google Apps Script and source Sheet unchanged and read-only during the parallel test.

## Backup integrity
- `/api/backup` is secured by a **nonempty** `CRON_SECRET`, pagination prevents the first-1000-rows truncation, and the cloud `backups` bucket must be private.
- Use a verified owner's backup email in settings; configure `RESEND_API_KEY` on the server, never in frontend variables.
- Test a full backup and restore onto an empty test project; do not assume backup is valid merely because email was sent.
- Browser offline localStorage is *not* a permanent backup. Do not clear the browser before the queue is empty.

## Vercel staging project
Project: `bright-carwash-v2-preview` (deployed as a protected preview without a real database connection). Source: this GitHub branch.
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
- Test after-midnight shifts (00:30 Riyadh) versus calendar-day reports, shared-worker car counts and SAR10 collective accrual.
- Test online, offline, reconnect, replays, and failed sync (no silent loss), including changing user accounts; test alert thresholds after monthly rollover.
- Test record edit/deletion audit, salary linked to workers ledger, expense corrections, backup and restore.
- Test on a mobile phone plus tablet and desktop browser.
- Only after successful staging verification, approve a controlled production cutover.

## Current infrastructure blocker (Nov 1, 2026)
Supabase creation of **Bright Carwash V2 Dev** in org `bright-carwash` was **rejected by quota**, despite a quoted **$0 monthly** project cost. Do not repurpose WorkshopOS or delete/pause unrelated projects without separate explicit user authorization. To unblock, the account owner must free a Supabase free-project slot or upgrade an appropriate plan. The Vercel staging project has been deployed in a safe unconfigured state; login and data writes remain blocked until the isolated project URL and publishable key are provided via protected environment variables.

## Verification
Vercel protected builds run `node --check scripts/migrate-safe.mjs && npm test && npm run build`. Latest verified preview build validates syntax, 66 unit tests, React compilation and TypeScript. It does **not** validate SQL migrations or Supabase Auth/RLS against a real DB; these remain blockers.

## Nov 5, 2026 — approved decisions and implementation boundaries
- Decisions A–G locked: shared worker PHONE account (no individual attribution); crew provision SAR10 TOTAL per car; legacy SAR2 after 15 cars frozen; worker discount cap SAR10; worker Ready action; owner must reopen an approved month before backdated corrections, then reapprove a new immutable report version; full cash/card/split payment captured at arrival.
- Frontend: worker arrival input now includes explicit discount and optional Saudi customer phone with SMS consent; ready notice requests can be enqueued while offline; manager gets crew-wide discretionary bonus form; owner gets monthly approval/reopen form. All are on the protected GitHub preview branch, NOT the legacy production app.
- SQL migration 0019 (NOT APPLIED) now adds account-based worker read RLS, discount cap policy, ready-SMS pending outbox and secured RPC, crew bonus ledger, owner re-open/approve month RPCs, immutable report versions and closed-month financial mutation guards. Do NOT apply to existing unrelated database.
- SMS provider is not connected. Ready requests can only be stored as PENDING; the preview must NOT claim that an SMS was delivered.
- Native iPhone/Android apps are NOT BUILT. Current web preview still uses browser-localStorage offline, which is not appropriate for long-term safe production use. The native SQLite-backed app, operating-system encrypted storage, device register/seals and true online/offline testing remain to implement.
- Final shift close and POS photo comparison are designed/tested as pure calculation helpers, NOT deployed as end-to-end database-backed manager approval. Inventory purchases/consumption are not yet implemented.
- Accounting SQL, OTP/Auth, provider sending, RLS, native offline sync and import reconciliations remain **UNVERIFIED** against a new dedicated Supabase DB. Never release or handle real production data on the preview on the strength of unit tests alone.
- Web build verified READY on Vercel at https://bright-carwash-v2-preview-lmwiu3r9w-ft-operations.vercel.app for commit ccf2a882274fe277cbd68318281b2dc911ab7019 with 66 tests passing; if newer commits are made, redeploy and recheck.
