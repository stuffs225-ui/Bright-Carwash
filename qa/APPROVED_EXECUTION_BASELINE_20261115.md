# Bright Carwash V2 — Approved execution baseline (2026-11-15, Riyadh)

This is an evidence ledger for the ten owner-approved options: **1,2,3,4,5,6,7,8,10,11**. Other options (9,12–18) are excluded. This file does not constitute a deployment approval.

## Immutable production reference
- GitHub repository: stuffs225-ui/Bright-Carwash
- Base commit: `864e8618d434de0ec9b38e00da05e5b1d8a26bdf` (PR #11 merge)
- Production alias at inspection: `bright-carwash-v2-preview.vercel.app`
- Vercel deployment at inspection: `dpl_AXna2uNkQzM5kHxM94X6q2vaNvHd`
- Database: existing dedicated Bright Carwash Supabase project; **do not copy data from another project**.

## Read-only snapshot (2026-11-15)
| Measure | Value |
| --- | ---: |
| Nondeleted car entries | 7,539 |
| Nondeleted expenses | 733 |
| Approved days | 534 |
| Active workers | 0 |
| Inventory items | 0 |
| Audit events | 25,323 |
| Existing crew payout rows | 0 |

- Two Vercel runtime timeouts on `/api/backup` within the last seven days (60-second maximum).
- Backup archive currently enumerates `carwash_report_corrections` dynamically; `carwash_crew_payouts` is **missing** from its explicit table manifest.
- The most recent successful backup noted in settings was 2026-11-14; an in-memory archive verification had last been recorded on 2026-11-11. In-memory verification is **not** a real database restoration.
- Supabase advisor flagged 15 authenticated SECURITY DEFINER RPCs, requiring per-function review rather than blanket grant removal.
- No real physical inventory quantities/consumption recipes have been approved. Never invent these values.

## Nonnegotiable controls
1. No production deploy before a complete CI suite, independent review, isolated restore test, mobile UAT, and owner's final production approval.
2. No historic amount overwrite; corrections only by explicit approval and auditable adjustments.
3. Protect current owner/worker link experience and manager's six-tab navigation.
4. No paid third-party services without approval.
5. A missing/late/offline device blocks closing until all **known** devices have synchronized and sealed; do not claim unregistered offline device discovery.
6. Do not auto-consume inventory until a real opening count and service recipes exist.
7. Photos and customer phone stay optional at car registration; WhatsApp link opening is not message delivery.
8. Site updates and SQL migrations must be separately approved for production, including rollback strategy.

## Acceptance gates
- Baseline data counts matched before/after any migration.
- Backup coverage manifest includes all financial and critical metadata tables, encrypts data, enforces size limits, and refuses to claim a full backup if incomplete.
- Owner/worker RLS & RPC negative tests pass and no unauthorized access is possible.
- Monetary and inventory changes are atomically idempotent, never posted twice.
- Desktop / simulated iPhone Chromium+WebKit + real iPhone UAT pass.
- No merge/release on CI failure; review unresolved findings explicitly.
