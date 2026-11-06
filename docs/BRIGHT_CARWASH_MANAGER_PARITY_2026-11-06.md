# Manager Feature Parity — Bright-Carwash (2026-11-06)

## Exact source inspected
The original Google Apps Script source backup contains:
- `index.html` — three navigation panels: **تسجيل السيارات**, **لوحة المصروفات**, **اللوحة الرئيسية**; detail/edit/delete car and expense dialogs, monthly report modal, monthly PDF export, employee/team management, alerts, and dashboard customization.
- `Dashboard.html` — income today/week/month/year, monthly/annual ROI, average daily net profit, daily and monthly income, expense and profit summaries, filtered weekly/monthly/yearly charts, payment and service breakdown.
- `ExpenseDashboard.html` — add/edit expenses, month/previous-month expenses, average spending, largest expense category, monthly comparisons and expense distribution.
- `CarEntryForm.html` — car entry, today's entries, monthly summary.
Source is preserved separately; no changes to original Apps Script or Google Sheet.

## 2026-11-06 remediation
The previous no-database preview only rendered two fake cards for balances and a manager phone field, hiding important modules already written in the real Next.js branch. The preview now has these navigable manager sections:

1. **لوحة رئيسية شاملة:** month/week/year selector; 11 source-grounded legacy KPI cards; four charts (daily revenue vs cost, cash/card split, expense categories, monthly comparison); detailed daily and monthly tables; click-to-detail rows.
2. **السيارات:** searchable and date-filtered car table, per-car details and CSV export.
3. **المصروفات:** current/previous month metrics, expense register/edit/delete and backdated expense date, monthly detail table.
4. **العمال والرواتب:** SAR10 crew collective provision per car, additional manager bonuses, salary, cash advances, payout entries, ledger.
5. **التقارير:** monthly income/expense/crew/provisional net comparison, selected-month report, CSV downloads and browser print/PDF preview.
6. **موازنة الأيام:** date-specific Saudi midnight closure, cash/card, per-car details and manager-approved variances. Approved date alone disappears from worker; all history is retained for manager.
7. **الإعدادات:** goal and example tariff catalog, a stock depletion prototype with low-quantity warning.
8. **التنبيهات:** expense threshold/stock warnings.
9. **حساب العامل:** manager can simulate creating one shared staff phone, and the real manager API has server-enforced restricted employee onboarding.

Two visible roles only: **manager (full dashboard and approvals)** and **worker (simplified car entry)**. Legacy Supabase SQL `owner` requirements are mapped internally to persisted manager role in migration 0021; direct client modifications of membership roles are revoked. This does not connect to or modify any other business or its database.

## Exact historical formulas
Original index.html explicitly calculates:
- Monthly ROI = `monthProfit / monthExpenses * 100` when expenses > 0, else 0.
- Yearly ROI = `yearProfit / yearExpenses * 100` when expenses > 0, else 0.
- Original net profit = income minus expenses, independent of later crew SAR10 accrual.
Those source formulas are shown separately from new *provisional* income - expenses - 10 per car to prevent silently changing the meaning of old KPIs.

## Critical status, remaining gaps
- **The preview contains FAKE session-only values**. It is not a manager account or access to original Google Sheet rows.
- **No independent Supabase project has been provisioned** due free project quota. Migrations 0001–0021 have been validated in disposable PostgreSQL, **not applied** to a production carwash environment.
- **No SMS provider**: worker phone onboarding / manager OTP and Ready notifications are not functional for real phone numbers.
- Demo CSV exports function; monthly browser Print is not identical to original styled PDF export yet.
- Real inventory quantities/consumption, actual crew payroll reconciled once into profit/cash accounts, retention/testing of real offline PWA data, and historical source importer require live separate database and end-to-end verification before go-live.
- A public, fake-data-only preview is suitable for UI review; **do not enter customer data, real payments, or sensitive employee data** in it.
- Original project and other business systems remain unchanged; code is on draft PR, not merged into production.

## Quality gates
GitHub Actions runs TypeScript, 18+ unit test files / 93+ tests, Next.js build, all SQL migrations on disposable PostgreSQL, and separate synthetic financial, calendar and manager-role E2E checks. Link to live run in GitHub Actions for latest commit rather than reusing a stale pass count. Do not claim real Auth/SMS/backup/mobile device E2E success.
