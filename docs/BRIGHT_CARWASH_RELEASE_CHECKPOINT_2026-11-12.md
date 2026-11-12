# Bright Carwash V2 — Production release checkpoint
Date: 2026-11-12 (Asia/Riyadh)

## Verified deployments and source
- Repository: stuffs225-ui/Bright-Carwash
- Development branch: chatgpt/carwash-approved-optimization-20261112
- CI passed for b1f1fa034e1992e1fe7d702c2b68b85151988e18 (synthetic PostgreSQL, TypeScript, Vitest, Next.js build, Chromium/WebKit mobile emulation).
- Existing Vercel production branch revision at inspection: 3e97cbfc7f7b9906e67d47f2f51ee577e0df8af0.
- The new branch's preview is not the existing production alias.

## Live Supabase migrations applied
Project: qsobrjtfyofmjeswktvb. New hosted migration IDs:
- 20261112122505_fail_closed_app_role
- 20261112122633_inventory_consumption_accounting
- 20261112122645_manager_report_corrections

Verification after application:
- Missing membership resolves to text role 'none', not SQL NULL.
- inventory_accounting_version = 2; empty stock movement history remained empty.
- Correction audit table exists, currently empty.
- Worker/authenticated role does not get direct EXECUTE on stock or correction RPCs.
- Active entries = 7,501; active expenses = 726. Neither count changed.

## Remaining release blockers
- 7,493 historical entries have no verified business_date source. Do not backfill based on guessed 04:00 rollover; it would change 1,382 day allocations and 43 month allocations, and may trigger payroll accrual.
- 723 historical expenses have no recognition_kind: reported result is not verified accounting net profit.
- 11 historical mismatches and 5 zero-value operations remain review only, not edited.
- Full server-issued RLS/ordinary authenticated-role test matrix, real mobile Safari/UAT, and actual latest encrypted production archive restore into an isolated database remain unverified.
- General post-approval reverse accounting corrections, time-effective wage policy, actual inventory count / opening amounts, and historical source acquisition are not complete.
- Pending network report mismatch alert added to the development branch; full pending-cash reconciliation remains outstanding.
- Keep the current production alias unchanged until mandatory release gates pass. Never mix this repo or its Supabase data with WorkshopOS Sahna.

## Maintenance
These migration filenames were synchronized to the hosted Supabase migration-history versions to avoid accidental repeated application on future migrations.
