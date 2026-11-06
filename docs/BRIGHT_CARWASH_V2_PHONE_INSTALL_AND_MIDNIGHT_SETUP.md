# Bright-Carwash V2 — Phone/PIN Login, PWA, Riyadh Days, WhatsApp (2026-11-06)

**THIS IS PREPARED SOURCE, NOT AN ACTIVATED FINANCIAL SYSTEM.** This project is **carwash only**. Never connect it to WorkshopOS Sahna or to the paused Seco-Seco database.

## Architecture and privacy

- GitHub: Next.js source, 23 reviewed SQL migrations, tests and import scripts. The repository is **public** and must contain no customer records, source financial imports, PINs, private WhatsApp tokens, Auth secrets or .env files.
- Vercel: preview web app/PWA and serverless handlers, with **encrypted** environment variables. Preview is for demonstration only until a standalone backend is verified.
- Supabase: **a new carwash-only database** for all Auth, financial records and storage. It has **not been created** due the active-free-project limit. Do not reuse WorkshopOS or Seco-Seco databases.
- Private Google Sheets snapshot: archived separately on private Drive, with original Excel, normalized lossless JSON, issues and source metadata; kept **outside GitHub**.
- Original Google Sheet remains active/read-only from this project. Do not swap to the preview as the system of record.

## Roles and PIN login

There are **two roles only** in the product: `manager` and `worker`. The shared worker login represents all operators; there are no separate per-worker accounts yet. All worker transactions are a **collective SAR 10 per car**, not ten riyals per worker.

The manager phone and 4-digit initial PIN supplied by the user are held only in **encrypted server setup variables**. They are not a live Auth account until the independent database has been created, checked and bootstrapped with `scripts/bootstrap-carwash-manager.mjs`.

Login uses the phone and four-digit PIN through `/api/auth/pin`, with a server-only HMAC secret to derive a high-entropy Supabase Auth password from the stable user ID + PIN. The plain four digits are **not stored in a table**, user metadata or GitHub. Five failed attempts in 30 minutes lock that phone; hashed IP throttling applies as a second defense. The API refuses any backend that is not explicitly identified by `CARWASH_DATABASE_PROJECT_REF`.

Account Information → user can change their own PIN after proving the existing PIN. Manager may change their phone only after SMS verification of the new number. Worker login uses one shared phone; phone replacement is manager-controlled to avoid locking out all worker devices. **SMS is only required for new-phone verification**, not everyday PIN login.

Production environment secrets: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CARWASH_DATABASE_PROJECT_REF`, `CARWASH_PIN_PEPPER`, `CARWASH_BOOTSTRAP_MANAGER_PHONE`, `CARWASH_BOOTSTRAP_MANAGER_PIN`. Server secrets must never be `NEXT_PUBLIC_` variables.

## Accounting day and manager

Calendar days are `00:00:00–23:59:59` in **Asia/Riyadh**. The worker may see multiple days if yesterday is still unapproved. A manager approves one finished day after cash/card figures, POS evidence and registered-device sync. Once approved, only that specific day disappears from worker view; accounting history remains available to the manager. Manager handles reconciliation variances; there is no separate owner role.

Financial correction after monthly approval requires documented reopen/re-approval. Historical source discrepancies are retained, not silently adjusted.

## Installable PWA and offline behavior

- iPhone Safari: Share → Add to Home Screen.
- Android Chrome: the in-app Install button or browser menu → Install.
- Both install a **PWA**, not a signed native App Store binary.
- Worker must first authenticate online, register the device and load the price catalog. Offline entry then queues local records with immutable timestamps and mutation IDs, which are synchronized when online.
- The static public offline shell does not record customer phone numbers. Browser storage can still be evicted; no guarantee until real iOS and Android offline, storage-full and recovery testing.
- Manager financial reports and approval cannot run offline.
- Do not clear or uninstall the application while unsynced transactions exist.

## WhatsApp Ready notice

The worker optionally records customer mobile and **explicit WhatsApp opt-in**. Marking a car ready creates one idempotent outbox row only after a synced transaction and explicit consent. `/api/whatsapp/dispatch-ready` sends a Meta-approved template through WhatsApp Cloud API; `/api/whatsapp/webhook` securely verifies the Meta signature and tracks delivered/failed results. Ambiguous HTTP failures are **not auto-resubmitted**, avoiding duplicate notifications.

Requires separately:
- approved WhatsApp Business account, WhatsApp Cloud phone number ID and access token
- a **Meta-approved utility template** and language
- matching webhook verify token, app signing secret and public HTTPS callback
- customer opt-in and a functioning operational number.

Server-only secrets: `WHATSAPP_CLOUD_GRAPH_API_VERSION`, `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_READY_APPROVED_TEMPLATE`, `WHATSAPP_READY_TEMPLATE_LANGUAGE`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `CARWASH_WHATSAPP_LIVE_ENABLED`. **None is connected in the preview.**

## Private source cutover and acceptance

1. Obtain separate Supabase project after quota/billing blocker is resolved; inspect ID and set exact project ref.
2. Apply migrations **0001–0023 in order**; run RLS checks and bootstrapping, without connecting to another business.
3. Re-export the original Google Sheet if changed since last private snapshot; preserve the previous original untouched.
4. Extract `PRIVATE_SOURCE/carwash_private_import_*.json` from the private ZIP; run `node scripts/import-private-carwash-snapshot.mjs /secure/path/snapshot.json` **without --apply**.
5. Set encrypted `CARWASH_IMPORT_APPROVED_SHA256` equal to the **JSON file** SHA256, not the ZIP. Run again with `--apply` only against the dedicated DB. The importer requires a source snapshot newer than 48 hours.
6. Verify row-by-row counts, totals and issue rows via `carwash_import_batches.status='verified'`, and compare aggregate cash/card/expenses. Do not misclassify missing payment records as settled income.
7. Test real manager/worker login and PIN rotation, two-device offline reconciliation, live WhatsApp delivery callback, backup/restore and monthly reapproval.
8. Only then promote a protected deployment with real data and remove demonstration mode.

## CI status

GitHub Actions validates TypeScript, all 23 PostgreSQL migrations, RLS, synthetic accounting day, manager privilege, offline/auth business rules, PIN lockout, WhatsApp explicit consent, private import script dry run and Next.js build. A successful fake-data CI test **does not** prove a running production Supabase system.
