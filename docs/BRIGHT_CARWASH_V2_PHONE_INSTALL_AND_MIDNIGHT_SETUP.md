# Bright-Carwash V2 — Manager Activation, Worker Install, Calendar Settlement

Status: **PROTECTED SOURCE / PUBLIC FAKE-DATA PREVIEW; NOT LIVE TRANSACTION SYSTEM** (2026-11-05). This is exclusively the carwash. **No WorkshopOS database, shared schema, worker record, employee list, financial balance, branch or media bucket is used.**

## Code / architecture ownership
- **GitHub:** all Next.js source, SQL migrations, unit tests, synthetic PostgreSQL E2E tests, PWA manifest/install route, public offline worker-entry fallback and manager bootstrap script.
- **Vercel:** deployment and distribution of front-end/public web app, plus encrypted server environment configuration. The Next.js runtime is hosted there (it is technically more than a pure DNS domain), but **not the business database**.
- **Supabase:** a **NEW INDEPENDENT PROJECT** for carwash Auth, user roles, database, media evidence and accounting, not yet provisioned because account quota prevented creating it.
- **SMS provider:** configure later; fake-data preview sends no SMS and cannot prove OTP login.
- GitHub repo currently public. No raw manager mobile number, service-role key or private project secrets belong in Git.

## Initial manager number
The manager phone supplied in chat is stored as a Vercel **encrypted Preview environment variable**, `CARWASH_BOOTSTRAP_MANAGER_PHONE`. **No Auth user exists yet** until a carwash-only DB is ready and the provisioning script runs. Never put the number into public GitHub.

When the separate database exists, provision manager securely using:
```bash
# From an authorized admin environment, never in client/browser:
# NEXT_PUBLIC_SUPABASE_URL = independent carwash Supabase URL
# SUPABASE_SERVICE_ROLE_KEY = backend-only secret
# CARWASH_BOOTSTRAP_MANAGER_PHONE = encrypted initial manager mobile
node scripts/bootstrap-carwash-manager.mjs
```
Then configure Supabase phone SMS and verify a real OTP sign-in. The script is idempotent and never overrides an existing different role. **Never run against WorkshopOS or Seco-Seco**.

## Manager worker phone controls
- Manager logs in via authorized mobile and OTP (once enabled).
- Management → Users: manager can create **one active shared worker account** by Saudi phone, deactivate it or reactivate it. SQL partial unique index forbids more than one active worker login even with concurrent API calls.
- Manager cannot invite an owner or manager, change worker role, or read owners' phone lists; API checks authorization server-side, no client-only security decisions.
- An owner role is needed for nonzero cash/network differences; manager phone alone does **not** become owner.

## Riyadh calendar days
- Days run from **00:00:00 to 23:59:59 Asia/Riyadh**. For example, 23:59 on Nov 5 belongs to Nov 5, 00:00 on Nov 6 belongs to Nov 6, even if Nov 5 is not yet approved.
- Worker screen shows all **unapproved** days with per-day car rows and the crew's collective **SAR 10 per car** (not per person).
- The manager selects one **finished** date and verifies cash/terminal totals with an uploaded POS evidence photo.
- All registered worker devices must confirm sync/sealing for that particular date; pending devices block settlement. An absent or lost phone requires owner-guided incident handling before go-live.
- Exact daily match → manager approves that date → its records disappear from the shared worker view, and remain archived for management. The worker's current/new date is unaffected.
- Any shortfall/excess → manager records reason → day waits owner variance approval; it stays visible to worker until owner completes the approval.
- All financial rows and original employee/device attribution are retained and audited.

## App install
- Android Chrome: use the in-app **تثبيت تطبيق المغسلة** button if the browser offers the PWA installation prompt; otherwise Chrome menu → Install app.
- iPhone Safari: use the same button for instructions, then Share → Add to Home Screen. Apple does not expose the Android installation prompt to web pages.
- This installs an actual **Progressive Web App** on the device, not an Android APK or iOS App Store signed native binary.
- Public root uses a network-first request; only a safe, public `offline.html` fallback and hashed static assets are cached. **No authenticated HTML, customer records or protected APIs are stored in the service-worker cache.**

## Offline behavior / restrictions
- After a worker has signed in online, enrolled the device online and loaded approved prices online at least once, the installed PWA's fallback records offline cars in a local queue, each with UTC capture time and the corresponding Riyadh date.
- Offline emergency shell has no customer phone entry, thus avoids caching phone numbers in that screen.
- Coming back online opens the main app and attempts to synchronize the queue idempotently. Server checks day approval, role, device enrollment, exact approved tariffs, discounts and duplicate transaction IDs. Rejected entries remain in local outbox for manual review; no silent delete or shifting an old record to a new date.
- Browser localStorage is *not* equivalent to an encrypted native app database; iOS background sync and durability after uninstall/storage eviction are **not guaranteed**. Before handling real transactions, run a two-device physical offline scenario, force-kill tests, low-storage tests, and device restoration tests.
- The manager demo uses fake, session-local data only. Its worker phone form is illustrative and does not create real users.

## Current release gates
- Dedicated independent Supabase DB created, 0001–0020 migrations applied, direct RLS checked and role bootstrap verified
- SMS OTP provider and customer Ready notification provider verified
- Owner account separately authorized for variance approval
- Real offline-to-online recovery tested on iOS and Android with cashier reconciliation
- Verified backup/restore and source-data migration reconciliation
- Correct financial payroll accrual and stock/consumable accounting
- Full comprehensive Arabic/English coverage

Do not merge development PR to main/production or describe the preview as live until the gates have been accepted.
