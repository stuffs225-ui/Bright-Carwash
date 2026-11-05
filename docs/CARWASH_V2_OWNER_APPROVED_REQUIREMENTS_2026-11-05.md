# Bright-Carwash V2 — Owner decisions, collision review and phased delivery
Approved by owner: 2026-11-05. Scope: ONLY the carwash. Keep this change on the draft/preview branch; no production rollout or contact with any other application's data.

## 1. Approved questionnaire register
|#|Choice|Binding requirement|
|--:|:--:|--|
|1|A|Create entry as soon as the car arrives.|
|2|B|No operational state machine (arrived/washing/ready/delivered).|
|3|A|Fixed wash services plus optional extras.|
|4|B, CONFIRMED|Worker may discount up to SAR 10 per vehicle. Enforce in UI AND database policy; cash/card amount is NET collected on arrival. Preserve discount as a separate amount from collected cash/card.|
|5|X|Full customer identity/history remains deferred; optional phone is allowed SOLELY for the approved ready notification.|
|6|B|Amend an original operation while preserving immutable before/after audit and identifying the shared login and device (not worker name).|
|7|B|System prepares draft cash/card reconciliation, manager approves it.|
|8|X|Assignment of multiple workers to a car deferred.|
|9|APPROVED|SAR 10 TOTAL for the combined workers/crew for EACH small car or large car. Never SAR 10 per individual worker. Separate manager discretionary shift bonus. Legacy extra SAR 2 beyond 15 cars FROZEN pending review.|
|10|A|Salary + bonuses + advances.|
|11|B|Manager may approve all ordinary expenses. Owner is final approver of balancing differences (question 30).|
|12|A|Purchase and consumption inventory with on-hand quantities and low-stock alerts.|
|13|SUPERSEDED by A below|Shared worker account can see entries created with that shared staff account. No per-worker attribution or personal performance reports.|
|14|A|Daily shift report + revenue/expenses + worker performance.|
|15|X|Subscription and package design deferred.|
|16|B|Native Android/iOS app plus manager web experience.|
|17|A|Automatic backup AND regular restoration drill; schedule/retention pending.|
|18|A|Zero-loss legacy source archive; anomalies are reviewed and not silently corrected.|
|19|A|One branch with expansion-safe database design.|
|20|B|Arabic/English switch throughout app.|
|21|B|One mobile app package, role-based screens; web manager is the same business backend.|
|22|A|Capture car type, service, price and cash/card/split at arrival.|
|23|A|Big tap targets, entry count, explicit offline queue status.|
|24|A|Auto sync when app opens, foreground network returns or app foreground resumes; manual Sync button. Background sync best effort only.|
|25|C|Both iPhone and Android.|
|26|UNANSWERED|Maximum offline duration, session expiry and device-loss recovery remain pending. Do not impose arbitrary limits.|
|27|C, CONFIRMED|ONE shared worker sign-in account (phone OTP), without individual worker identification; manager/owner still use separate privileged accounts. Track which DEVICE submitted an entry for sync safety, not who the worker was.|
|28|A|NO FINAL close until every registered device's pending entries are acknowledged by server; offline/missing devices visible.|
|29|B|Manager manually enters card statement total + attachments (photo or scan) and actual cash count.|
|30|A|Balance difference requires written reason + owner approval.|
|31|B|Worker may correct a LOCAL unsynced entry, maintaining revision record and pending manager review.|
|32|B|Owner can reopen an approved shift with reason and full audit trail, then reapprove.|
|Additional|Approved|Worker presses READY after washing; optional customer mobile receives one ready SMS, not a separate wash lifecycle. Pending/failed SMS must not be shown as sent. No SMS without configured provider.|
|Additional|Approved, F|For expense related to an APPROVED previous month, OWNER must REOPEN the month, record reason, review expense and REAPPROVE revised monthly report. Preserve original report and audit/history; capture/created/effective dates distinct.|
|Additional|Approved|Manager can grant an extra discretionary reward at end of shift, separately from per-car worker entitlement.|
|Additional|Approved|Phone OTP login and persistent sessions on device as long as authorized and valid.|

## 2. Architecture—zero crossover
Mobile: one React Native/Expo package for iPhone/Android; role-based worker and manager UI. Web manager continues in Next.js and shares ONLY this carwash's isolated Supabase database, Storage, Auth, SMS provider and service secrets.
Offline: SQLite durable outbox, device installation ID, local UUID per mutation, locally captured timestamps, last reviewed catalogue/config, validated cached authorized role. Sensitive material stored using OS-protected keychain/keystore; use encryption for sensitive local data. Each transaction's UUID is unique and is acknowledged by server before deletion. Queued events use a strict FIFO order, deduplication, retry/backoff and visible failed/pending/synced status. Native background tasks are opportunistic, NOT a delivery guarantee when app is killed. Offline staff entry requires a previously authorized device; cannot enroll brand-new user offline.
Server: idempotent financial RPCs with role checking, RLS, append-only event log and per-device sync watermark. Shifts are stateful OPEN -> DRAFT -> PENDING_OWNER_DIFFERENCE (if needed) -> APPROVED, with REOPENED by owner -> APPROVED again. Reopening never deletes the old approval or report snapshot. Device registry records per-device outstanding counts and last acknowledged UUID. A final approval MUST validate all registered/active devices, not only the manager's browser queue.
SMS: separate guest notice from staff sign-in OTP; a single explicitly triggered Ready action and one deduplicated notification event; no unsolicited advertising. Store phone only for order notification until retention is decided. Never send directly from the mobile client; a server job with private provider key queues and records delivery status. When ready is tapped offline, mark notice UNSENT until it can be checked online; do not claim SMS delivered early.
Accounting: expense effective date, client capture datetime, server posting datetime and approval datetime are DISTINCT. A late entry to an already approved month goes to a reviewed adjustment or owner re-open workflow; do not silently revise old signed reports. Inventory purchases and consumption must not be double-counted: distinguish expense cash flow, inventory asset and consumption into COGS.
Worker compensation: initial base labor provision is SAR 10 for a small and for a large vehicle. Record manager voluntary bonus as a separate approved ledger type. Do not automatically calculate individual worker earnings until worker assignment/allocation rule is approved.

## 3. BLOCKERS / questions that need a narrow follow-up
Q-A: RESOLVED by owner: shared staff account and shared staff-account records (NO personal worker identity). Device registry still tracks which installation has unsynced data. Worker performance analytics cannot identify an individual; show shift/crew totals only.
Q-B: RESOLVED: SAR 10 per vehicle is total CREW pool for each small or large car. Distribution by individual employee is not tracked in shared-login mode.
Q-C: RESOLVED: old SAR 2 bonus above 15 cars is FROZEN; new SAR 10 CREW provision is recorded per car. Since cash/card payment occurs at ARRIVAL, provisional earnings accrue at confirmed arrival; refund/reversal corrections must adjust provision.
Q-D: RESOLVED: SAR 10 per vehicle maximum for shared worker account. Enforce even on replaying queued offline events with database policy. Manager/owner edits remain audited.
Q-E: RESOLVED: Worker explicitly taps READY. SMS to customer only after server receives/safely queues event; do NOT claim it has been delivered until provider confirms. Offline-delayed SMS threshold remains unspecified.
Q-F: RESOLVED: OWNER REOPENS approved previous month with reason, then reapproves revised report; preserve prior approved version and all audit records.
Q-G: Device registry on shared login: should manager enroll/approve each physical phone/tablet and remove lost ones? (Recommended yes for requirement 28.)
Q-H: Inventory units, beginning quantities, and expected usage per service: no unapproved auto-consumption quantities.
Q-I: Bonus is a separate shift CREW entitlement from salary, pending cash payout. If paid, create a distinct payment ledger expense; do not double count accrued versus paid.

## 4. Release gates
1) No changes to any other project, original Google Sheet, or production website.
2) Independent Supabase project still NOT provisioned due to free-tier active project quota. Do not use paused historical Supabase project before its database is archived.
3) Apply migrations against isolated development database; verify role permissions, shared-phone behavior, journal audit, backdated expenses and idempotent sync including offline device-lost/retry simulations.
4) Configure OTP SMS provider, consent/retention for guest messages and provider credentials outside code.
5) Test native build and offline restart on physical iPhone and Android with no network, clock skew, expired tokens, two devices and killed background app.
6) Test complete manager reconciliation/card statement image/upload, owner difference approval and owner shift reopening.
7) Verify historical import counts and resolve exceptions before go-live; run restore test of backup.
8) Only then approve release and production DNS/app-store publishing.

## 5. Further binding decisions confirmed after owner answered A–G
- A: No personal worker differentiation (shared SMS login for all workers; account-level view).
- B: SAR 10 crew pool total for every eligible car, regardless of small/large type.
- C: Freeze previous threshold bonus until owner reviews it. Do not display a positive old-bonus amount or permit changing legacy threshold as an active earning formula.
- D: Worker discount maximum SAR 10 per car, independent of whether customer pays cash, card or both. Preserve pre-discount list price and post-discount collected amounts.
- E: Worker presses Ready; one customer notification per car once provider is active. No fake delivery confirmation.
- F: Owner reopens the approved accounting month before retroactive expense adjustment; revised report requires owner reapproval and retains previous snapshot.
- G: Payment is received and recorded upon vehicle arrival. No payment-on-delivery workflow.

Deferred questionnaire: 5 (full customer details), 8 (individual assignments), 15 (subscriptions), 26 (offline maximum/limits). These remain UNAPPROVED.
