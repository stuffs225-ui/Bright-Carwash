# Bright-Carwash V2 — Owner decisions, collision review and phased delivery
Approved by owner: 2026-11-05. Scope: ONLY the carwash. Keep this change on the draft/preview branch; no production rollout or contact with any other application's data.

## 1. Approved questionnaire register
|#|Choice|Binding requirement|
|--:|:--:|--|
|1|A|Create entry as soon as the car arrives.|
|2|B|No operational state machine (arrived/washing/ready/delivered).|
|3|A|Fixed wash services plus optional extras.|
|4|B|Worker may apply a bounded discount (limit still needs numerical definition).|
|5|X|Customer identity/history scope deferred; new phone-for-ready-message request is separately approved.|
|6|B|Amend an original operation; immutable before/after audit retained.|
|7|B|System prepares draft cash/card reconciliation, manager approves it.|
|8|X|Assignment of multiple workers to a car deferred.|
|9|AMENDED|SAR 10 for each small car AND SAR 10 for each large car, plus optional manager shift bonus. Allocation among workers pending. Do not assume legacy post-threshold bonus is retained or replaced until clarified.|
|10|A|Salary + bonuses + advances.|
|11|B|Manager may approve all ordinary expenses. Owner is final approver of balancing differences (question 30).|
|12|A|Purchase and consumption inventory with on-hand quantities and low-stock alerts.|
|13|A|Worker sees only their own entries. Cannot enforce strict ownership with shared Auth identity without a second identity factor.|
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
|27|C|ONE shared worker sign-in account (phone OTP); managers/owner have their own authorized accounts. Worker-specific audit/visibility remains a conflict requiring a worker identifier distinct from login.|
|28|A|NO FINAL close until every registered device's pending entries are acknowledged by server; offline/missing devices visible.|
|29|B|Manager manually enters card statement total + attachments (photo or scan) and actual cash count.|
|30|A|Balance difference requires written reason + owner approval.|
|31|B|Worker may correct a LOCAL unsynced entry, maintaining revision record and pending manager review.|
|32|B|Owner can reopen an approved shift with reason and full audit trail, then reapprove.|
|Additional|Approved|Optional customer mobile to send a single ready-for-collection SMS when operator explicitly presses Ready; separate from full wash lifecycle stages.|
|Additional|Approved|Back-date the EFFECTIVE expense date for a previous month while retaining actual capture, server posting and approver timestamps.|
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
Q-A: Shared worker account (27C) VS per-worker visibility (13A) and audited personal changes: options (A) shared SMS login, then each person chooses their worker profile with personal PIN; (B) shared SMS login with a dedicated fixed named device assigned to one worker; (C) per-worker phone sign-in instead of shared identity. A or C preferred for reliable evidence; account sharing alone cannot enforce per-worker RLS.
Q-B: SAR 10 per vehicle is (A) total crew pool for each vehicle, (B) EACH participating worker receives SAR 10 for each vehicle? Do not infer.
Q-C: Does new SAR 10 rate REPLACE the old extra SAR 2 per car beyond 15, or both remain? And is a reward earned at arrival or only a completed/paid wash?
Q-D: Upper discount amount for worker, e.g. SAR 5 or percentage, and can worker discount while offline? Must not ship open-ended discounts.
Q-E: SMS ready button without lifecycle stages: (A) small Ready button on active recorded cars, (B) only manager sends ready message; and whether an offline delayed notice should be sent after many hours.
Q-F: How should the manager handle prior-month expenses already approved (A) special reviewed prior-period adjustment while keeping old report snapshot, (B) owner reopens/reapproves the month?
Q-G: Device registry on shared login: should manager enroll/approve each physical phone/tablet and remove lost ones? (Recommended yes for requirement 28.)
Q-H: Inventory units, beginning quantities, and expected usage per service: no unapproved auto-consumption quantities.
Q-I: What counts as a manager's discretionary bonus: addition to worker payable without an immediate cash expense, or cash paid now? Default distinguish accrual from payment, but user needs clear options.

## 4. Release gates
1) No changes to any other project, original Google Sheet, or production website.
2) Independent Supabase project still NOT provisioned due to free-tier active project quota. Do not use paused historical Supabase project before its database is archived.
3) Apply migrations against isolated development database; verify role permissions, shared-phone behavior, journal audit, backdated expenses and idempotent sync including offline device-lost/retry simulations.
4) Configure OTP SMS provider, consent/retention for guest messages and provider credentials outside code.
5) Test native build and offline restart on physical iPhone and Android with no network, clock skew, expired tokens, two devices and killed background app.
6) Test complete manager reconciliation/card statement image/upload, owner difference approval and owner shift reopening.
7) Verify historical import counts and resolve exceptions before go-live; run restore test of backup.
8) Only then approve release and production DNS/app-store publishing.
