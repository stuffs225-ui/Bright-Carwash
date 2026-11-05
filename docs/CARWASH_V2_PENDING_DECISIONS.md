# Bright-Carwash V2 — Pending Product Decisions
Status: QUESTIONS ONLY. Nothing in this register constitutes approval for implementation.

This document applies **only to the car wash application**. All data, authentication, hosting, source files, financial controls, reports, and storage are scoped to Bright-Carwash, never shared with another business or project.

## Existing approved baseline (retain unless user changes it)
- Primary workflow: car wash registration, service/type, card/cash/split settlement, expenses, workers, analytics, reports, configurable settings.
- Operational shift: 15:00–04:00 Asia/Riyadh; reports by calendar day are separately calculated.
- Historical bonus baseline: after first 15 cars in shift, SAR 2 per additional car, pending allocation rule.
- Original Google Sheets remains read-only; migrations must preserve all rows and flag exceptional records.
- Supabase must be an independently created, isolated car-wash project; no shared accounts, tables, storage or secrets.
- Privacy/security: owner/manager/worker roles in database, audit logs for financial corrections.
- Current Vercel preview intentionally lacks Supabase data connection pending independent project provisioning.

## Questions: user to answer 1A, 2B etc.
1. When register the wash: A) Arrival + status flow, B) Payment/completion only.
2. Workflow: A) Arrived / washing / ready / delivered, B) Recorded only.
3. Services: A) Fixed services plus extras, B) fixed presets only, C) manual custom descriptions and pricing.
4. Discounts: A) Manager approval + reason, B) worker limited discount, C) no discounts.
5. Customer/plate: A) Optional plate only, B) optional plate + name + mobile + customer history, C) no identifying details.
6. Income correction/refund: A) Separate reversal & approved correction, B) authorized edit in original row.
7. Shift closure: A) Manager cash/card/manual settlement report with discrepancies, B) automatic closure on schedule.
8. How worker assignments work: A) one worker per car, B) multiple workers/team, C) optional team assignment.
9. Bonus rule distribution: A) per worker by assigned cars, B) equal division among shift team, C) manual owner assignment.
10. Worker compensation: A) salary + bonus + advances, B) hourly + bonus, C) flexible per worker.
11. Expenses: A) Manager enters; owner approves exceptional amounts, B) manager approves all, C) owner approves every expense.
12. Inventory/consumables: A) basic materials purchase and usage/stock, B) expenses-only and no stock.
13. Operational permissions: A) worker sees own entries only, B) worker sees all today's cars, C) worker sees cars and total amounts.
14. Reports: A) operational close + financial KPI + worker performance, B) financial summary only.
15. Membership & subscriptions: A) phase 2 later, B) prepaid wash packages now, C) fleet/monthly accounts now.
16. Offline support: A) save offline with strict audit/sync warning and block closure until sync, B) online only.
17. Backups: A) daily cloud backups + periodic restoration test, B) manual backup only.
18. Historical discrepancies: A) hold 11 total mismatches and 2 missing fields for recorded reconciliation, B) prefer saved total, C) prefer cash+card split; all source rows preserved.
19. Number of branches: A) single branch with expansion-ready schema, B) multiple branches now.
20. Interface language: A) Arabic primarily, B) Arabic/English switchable.

## Response example
1A 2A 3A 4A 5A 6A 7A 8B 9B 10C 11A 12B 13B 14A 15A 16A 17A 18A 19A 20A

Pending responses MUST NOT be treated as defaults authorized by the user.
