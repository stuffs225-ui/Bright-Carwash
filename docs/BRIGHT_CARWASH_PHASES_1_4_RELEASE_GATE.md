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
