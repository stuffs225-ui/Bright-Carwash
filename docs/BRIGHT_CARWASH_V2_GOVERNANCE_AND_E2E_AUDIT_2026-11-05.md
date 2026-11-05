# Bright-Carwash V2 — Security / End-to-End / Governance Audit
Inspection date: 2026-11-05. Scope exclusively: **Bright-Carwash V2**. No interconnection with other businesses or their databases.

## Evidence and reproducibility
- GitHub draft PR: https://github.com/stuffs225-ui/Bright-Carwash/pull/1
- GitHub Actions: https://github.com/stuffs225-ui/Bright-Carwash/actions/workflows/carwash-v2-quality.yml
- Historical CI failure email at commit 8516a39 was caused by WRONG pinned SHA for actions/checkout. Fixed pin to exact GitHub verified checkout commit 11bd71901bbe5b1630ceea73d27597364c9af683. Confirmed successful run 42105545105. Duplicate push/PR triggers removed; CI runs on branch push only.
- 2026-11-05 CI run 42110817263: SUCCESS both quality and synthetic PostgreSQL E2E. 16 test files, **85 unit tests**, TypeScript check, Next.js production build, all 0001–0019 migrations applied to disposable PostgreSQL 16, synthetic role/security/financial workflow checked. Further source modifications require separate run verification.
- Synthetic PostgreSQL fixture uses fake identities, fake receipts and storage metadata. **NOT** a live Supabase integration test. It cannot certify actual Auth OTP, Supabase Storage, SMS delivery, native offline persistence or real database backup.

## Owner-confirmed workflow, implemented on draft branch
- One shared worker account via approved Saudi phone SMS OTP (provider unconfigured).
- Worker record car and net cash/card collected upon arrival, fixed service preset plus selected add-ons, max worker discount SAR10, optional customer phone with explicit consent for Ready SMS.
- Worker sees current open/pending-approval financial shift totals, tap-to-detail car rows, **SAR10 total PER car for entire crew**. The legacy SAR2 above 15 cars remains frozen.
- Worker can request Ready; while offline, requests must queue and be idempotently sent to pending outbox when online. No SMS is sent until provider is connected.
- Owner/manager see shift settlement, POS proof upload, expected cash/card and physical values, wait for all registered staff devices sealed before closing.
- Exact balance -> manager approved -> **new shift** -> old staff entries hidden by RLS and UI. Variance -> owner approves -> new shift. Archived entries and financial audits retained, not deleted.
- Owner may reopen approved month to enter a backdated expense and reapprove report, preserving previously approved versions.
- Crew extra bonus is a separately recorded accrual, not a cash salary payment.
- KPIs in car registration, analysis, expenses, worker ledger and manager shift review support click-to-detail.

## Findings with go-live severities
|Level|Finding|Current control|Release gate|
|--|--|--|--|
|P0 blocker|Dedicated Supabase carwash project not provisioned due account-wide active free project quota.|All code isolated in draft PR and protected Vercel preview with Auth/write disabled if unconfigured.|Create new independent project; apply migrations; verify real RLS/Auth/Storage and all migrations. Do not repurpose old Seco-Seco until its full DB archive is verified.|
|P0 blocker|True native Android/iOS offline app not produced.|Web localStorage queue and unit-tested native synchronization protocol are NOT a native app.|Build and sign real native apps with SQLite/OS secure storage, offline cold-restart, device enrollment, replay & revocation tests.|
|P0 blocker|Full phone OTP SMS service and guest Ready SMS provider not configured.|Ready notice remains pending, no fake 'delivered' status. OTP client is coded but untested.|Configure verified phone OTP provider and SMS sender; enforce consent, delivery audit, retry, expiration and retention.|
|P0 blocker|Real customer historical data migration not validated.|Source rows/financial mismatches preserved in importer design; originals remain untouched.|Run read-only audit/dry run, fix 11 monetary mismatch rows and 2 malformed entries without discarding, reconcile cash/card/expenses and full row counts.|
|P0 blocker|Signed production backup + restore test not verified.|Config and endpoint scaffolding exists, but no successful real restore test.|Verify protected DB+storage backup and complete restore on disposable isolated environment.|
|P1 high|Shared-account device protocol trusts device's declaration of complete sync; a missing or destroyed device may have data never registered.|Manager close blocks all REGISTERED unsealed devices, sync queue shows pending locally, old device IDs never intentionally reassigned.|Native server-acknowledged watermark, enrollment list controlled by owner, lost-device exception with incident evidence and owner authorization.|
|P1 high|Server-only validation of fixed base price+active add-ons and SAR10 discount applied, but not yet exercised in real Supabase.|Synthetic PostgreSQL E2E rejects direct arbitrary prices, records verified add-on total; shared worker RLS restricts visibility.|Test direct REST/RPC forgery, offline replay conflicts, service tariff updates and pre-change historical prices on real project.|
|P1 high|Original user-approved owner reopening of a final *shift/day* with versioned reconciliation has NOT been implemented.|Manager settled shift is financially immutable, approved monthly reports can be reopened separately.|Implement owner-only reopen and versioned settlement/correction flow, without revealing archived shift to workers or double-counting.|
|P1 high|Supabase Storage POS evidence upload only synthetically tested through metadata; no real binary upload and access verification.|Private bucket and owner/manager RLS SQL authored; UI requires proof.|Real Supabase test with worker forbidden access, manager upload/read, hash/content-size proof and rejection of fake path.|
|P1 high|One browser-localStorage queue is not a durable multi-day offline mobile solution; offline first sign-in cannot work.|Current website must NOT be used for production worker offline tasks.|Native SQLite-backed outbox, encrypted secrets, signed-in cached device admission & full offline tests.|
|P1 high|Authorized crew SAR10 provisioning and bonuses not yet reconciled into end-to-end payroll and cash payments.|Worker displays provisional collective amount; approved shift saves provision, manager extra bonus table separate.|Post approved crew accrual to dedicated ledger; salary/advance/bonus payments reconciled once; avoid profit/cash double counting.|
|P1 high|Inventory stock/consumable usage feature was approved but not developed.|Expense purchases still work, but no stock quantity consumption control.|Design stock units/lot movements/opening balances, purchase vs consumption/COGS and alerts, reconcile financial statements.|
|P2 medium|Full bilingual Arabic/English requested; UI has partially translated entry screen.|Legacy pages still mixed languages.|Centralize i18n and translate all manager/worker/owner screens; test LTR/RTL.|
|P2 medium|Date computations in some reports rely on device timezone rather than Asia/Riyadh.|Shift boundaries use Riyadh in helper; some daily/month date aggregations still local.|Audit and test Riyadh midnight/calendar shift vs imported dates at 00:00–04:00.|
|P2 medium|Public source repository.|No credentials or user data committed; preview protected on Vercel.|Set GitHub repo private before customer data, backups or paid providers and review collaborator access.|
|P2 medium|GitHub Actions can send success/fail email for each code push.|Wrong action SHA and duplicate-trigger source of spam resolved.|Manage GitHub notification preferences if desired; preserve failure alerts for true regressions.|

## Required end-to-end go-live scenarios on isolated Carwash Supabase
1. Owner created through phone Auth, allowlisted shared staff number, manager number; attempt unauthorized phone and role escalation.
2. Open shift, enroll two worker devices, register 10 cars, combinations cash/card/mixed, named tariff/extras, <SAR10 and >SAR10 discounts, phone consent; server must reject forged prices/expired addons.
3. Disconnect iPhone and Android, queue ≥100 records, reboot devices, reopen app offline, edit unsent entries with revision audit, retry dropped acknowledgements & duplicate client UUID; zero loss/double booking.
4. Restore connection (in foreground and after app killed). Compare local counts, accepted receipts, server totals and per-device watermarks. Lost phone scenario blocks close pending owner decision.
5. Send ready-for-collection SMS once; verify consent, provider id, delivery status and failed/retried/expired ready notice.
6. Both devices seal, manager opens settlement: all cars, cash/card, POS report photo; reject wrong/unuploaded photo, missing device and any unreviewed correction.
7. Exact match manager approval: old worker summary resets to empty/new shift while manager historical report and audit remain. New car registration starts in new shift only.
8. Nonmatching POS: require difference reason and owner approval. Reject manager self-approval; then reset worker UI and store original variance evidence.
9. Owner reopens approved month, corrects backdated expense, reapproves with versions, ensure no change to older archived report snapshot.
10. Test payroll crew SAR10 + separate manager bonus + salary/advance/payment ledger; no duplication in cash/profit accounting.
11. Material purchase, consumption, low-stock alert, inventory/expense/COGS reconciliation.
12. Full restricted backup and restore with encryption, row counts and read/write isolation.

**Release decision: NOT APPROVED.** The current code is a verified protected PREVIEW with both unit and synthetic DB QA but is not a customer-operational native app or audited live Supabase environment. Keep the original carwash sources untouched until all P0 gates are resolved.
