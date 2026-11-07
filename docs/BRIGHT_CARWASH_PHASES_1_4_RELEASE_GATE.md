# Bright Carwash — Approved Implementation Gate (2026-11-07)
Changes are committed only to the development branch. Never merge or deploy Production until:
1. GitHub unit tests, TypeScript, Next.js build and isolated Postgres migrations all pass.
2. A manager private URL is opened on a fresh iPhone browser and successfully reaches the dashboard.
3. The shared worker URL passes registration, duplicate, price, expiry, revocation and connection-loss E2E scenarios in disposable test data.
4. A production-size encrypted backup is generated and restored successfully to an independent disposable Supabase project, including POS evidence attachments, with row-count and money reconciliation. No restore into Production.
5. The production environment has separate protected CRON_SECRET (>=16 chars), CARWASH_BACKUP_KEY_BASE64 (32 random bytes, base64), CARWASH_BACKUP_EMAIL, CARWASH_BACKUP_FROM_EMAIL (verified sender), RESEND_API_KEY, and SUPABASE_SERVICE_ROLE_KEY configured. Store the encryption key in a separate password manager; losing it makes backups unrecoverable.
6. Backup offsite delivery, key rotation and retention are verified. The encrypted JSON export does not include Supabase Auth password hashes, and replacing Auth accounts from this archive is not a supported recovery path.
7. No changes to manager bearer-link login or to historical entry/expense amounts.
8. One active shared worker link only. A lost raw link cannot be retrieved from its hash: revoke and reissue, with the manager's explicit confirmation.
9. The original 11 mismatch-tagged operations stay immutable pending individual review.
A synthetic encrypt/decrypt test proves envelope integrity, **NOT** actual disaster recovery until external restore rehearsal passes.

## Implemented on branch (not Production)

- GitHub: `chatgpt/bright-carwash-approved-phases-20261107`; owner bearer URL login code NOT changed.
- One shared worker link: backend now limits creation to one active capability. Existing active link is preserved; workers still have no Auth accounts, management API or finance access.
- Offline worker: encrypted non-extractable-key IndexedDB queue, immutable UUID per car, replay on reconnect, and a generic public service-worker fallback for an offline cold start. No manager/worker bearer token is persisted in the browser cache. Must visit online once to preload the service catalog and service worker.
- Historical anomalies: manager-only list of the 11 mismatch-tagged historical records. No amounts edited or re-imported.
- Financial reports: Riyadh day/month grouping aligned, inaccurate 'net profit' presentation clarified as the recorded revenue less recorded expenses; underlying approved monetary formulas unchanged.
- CI reproducibility: TypeScript regression and SQL migration statement terminator fixed. New additive 0027 migration prepares correct Saudi customer-phone regex on the production RPC, but it must NOT be applied until production release approval.
- Backups: encrypted AES-256-GCM + gzip archive of permitted public tables and POS evidence, server-only encryption, Supabase private bucket plus encrypted external email, daily Vercel cron, safe same-day retry, integrity verification CLI at `scripts/verify-carwash-backup.mjs`.
- Synthetic cryptographic round-trip and ephemeral PostgreSQL JSON restoration rehearsal added to GitHub Actions. Neither constitutes restoration of an actual production backup.
- Vercel Production deployment and Supabase production schema were NOT changed.

## Blocked before production release

1. Independent Supabase test branch requires an additional `$0.01344/hour` and explicit owner approval. No paid branch was created.
2. Exercise manager and shared worker links end-to-end on the disposable staging project, including valid/invalid payment, duplicate submission, revoked link, full iPhone Safari offline cold start, offline retry and cross-device cases.
3. Run an actual production-size encrypted export, offsite delivery and complete restore rehearsal in disposable storage/database, including POS attachments. Confirm Auth identity disaster-recovery separately; this archive is not a `pg_dump` of internal Auth.
4. Configure the production-only environment variables and verify security of `CRON_SECRET`, `CARWASH_BACKUP_KEY_BASE64`, `CARWASH_BACKUP_EMAIL`, `CARWASH_BACKUP_FROM_EMAIL`, and `RESEND_API_KEY` through private secret controls, not through chat or GitHub.
5. Agree on backup retention and key escrow. Never automatically delete business records or user accounts.
6. Run PR checks to the exact final commit. Merge/deploy/apply production migration only after all the above tests pass.
