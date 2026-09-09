# Digitask correction phases

Work branch: `fix/phase-1-page-loading`. Changes are not deployed to production.

1. **Page stability:** dashboard, Stats, Settings, My Store and publishing controls. Small batches with regression tests.
2. **Security:** participant permissions, administrative authorization, protected account fields and safe user-content rendering. Verify in an isolated Firebase environment.
3. **Marketplace lifecycle:** consistent gig/product models, publishing, orders, payment verification, delivery and purchase entitlement.
4. **Administration:** moderation, payouts/disputes, real reports, audit logs and reliable notifications.
5. **Launch experience:** accessible navigation, accurate content/domain links, mobile layout and PWA installation/update/offline validation.

## Phase 1, batch 1 — implemented locally

- Dashboard active-gig listeners call the existing renderer, wait for both client/freelancer queries, deduplicate shared records and retain visible errors if either query fails.
- Active-gig values are escaped before HTML rendering.
- Stats module is closed correctly and imports getDoc.
- Completed-gig arrays display a count rather than record IDs.
- Statistics/activity failures have explicit error states instead of silently displaying zeros/empty success.
- Activity descriptions render as plain text; absent descriptions/dates do not crash rendering.
- Removed the Stats page's full authenticated-user debug log.

Validation: `node --test tests/phase-1-loading.test.cjs` — four tests pass. Tests execute actual source sections with mocked Firebase/DOM behavior; they cover listener ordering, duplicate gigs, failures, empty data, safe text, missing activity fields and signed-out redirects. `git diff --check` passes.

Limits: these are local regression checks, not a browser or deployed-Firebase sign-off. Other audited defects remain. No production data or security rules changed. Before release, verify the batch in a browser against controlled Firebase data. Next Phase 1 batch: Settings/My Store scope errors and publishing modal/duplicate-handler fixes.

## Phase 1, batch 2 — forms and initialization

- Removed the conflicting Settings demonstration script, retaining the Firebase implementation and clearing sensitive modal input when closed.
- My Store uses its loaded compat Firestore API to subscribe to platform settings.
- Publishing has one submit handler per form, calls validation before uploads, rejects invalid numeric values and blocks duplicate submissions while saving.
- Removed simulated gig success/reset behavior. Failed writes keep form values; successful writes reset them.
- Product-form deep links select the product tab. Job categories share the correct script scope and no longer overwrite product categories after authentication.
- Removed the missing featured-modal dependency and its simulated payment flow. Featured options are visibly unavailable until the real approval workflow is completed; ordinary publishing remains available subject to existing permissions.

Validation: nine local regression tests pass across both batches. The three modified pages have no extracted JavaScript syntax errors, duplicate IDs or missing local assets in the static scan. Browser and Firebase integration verification remain pending.

Not claimed fixed: seller write permissions, product ownership/schema consistency, My Store product-edit persistence/cart payments, Settings 2FA enforcement or account-deletion workflow. These retain their audit findings and are scheduled for the security/marketplace phases. Do not release this branch as a finished marketplace.

## Phase 2, batch 1 — administrative account endpoints

- Both account-status HTTP endpoints require POST, a verified Firebase ID token (including revocation/disabled-user checks), and membership in the existing admins collection. Authorization failures occur before account writes or pending-update queries.
- Status changes accept only active, suspended or banned with a valid user identifier. Unknown statuses can no longer silently enable an account.
- Recovery calls the shared handler directly and reports failed updates accurately. Trigger failures propagate; failed updates are not marked processed. Automatic retries are not enabled by this change.
- Client-facing errors omit internal exception details.

Validation: `node --test tests/*.test.cjs` — 14 tests pass, including five new security regression tests exercising the exported handlers with mocked Firebase services. Syntax and whitespace checks pass. Reference: https://firebase.google.com/docs/auth/admin/manage-sessions

Release requirements: verify valid admin, ordinary user, revoked-session and failure cases in an isolated Firebase deployment. HTTP callers must send POST with an Authorization Bearer ID token. No in-repository callers of these HTTP endpoints were found. This commit is not a production security sign-off and has not been deployed.

Remaining Phase 2 work: conversation membership/sender restrictions; protected user fields; admin status queue path/rules consistency; safe content rendering; Settings account deletion/2FA behavior. Existing broad Firestore permissions remain a release blocker. Admin UI and Auth/Firestore status consistency require integration work before release.

## Phase 2, batch 2 — message and profile rules (pending emulator verification)

- Conversation reads require administrator access or membership in the existing two-person participants map array. Participant changes are administrator-only; members can update the last-message preview/timestamp.
- Message reads require membership or administrator access. New messages bind senderId to the caller. Members cannot rewrite another person's text or change sender identity; recipients can mark messages read. Administrator moderation remains available.
- Profile creation is limited to the caller's own document and known signup fields with zero financial/count defaults and default buyer/seller flags. Profile updates use an allowlist, protecting balances, moderation, verification and unknown future fields against additions, changes and removals.
- The Settings 2FA control now says unavailable and is disabled. The old database boolean did not enforce MFA and is no longer presented as proof of protection.
- Added a separate Firestore emulator test suite with synthetic accounts and no production credentials.

Validation: existing 14 regression tests pass. The emulator run was blocked by cancelled network approval, so the five new rules tests and rule compilation remain UNVERIFIED. Do not deploy this batch until the emulator suite and staging browser checks pass. See tests/security/README.md for the exact commands and compatibility checks.

Compatibility: malformed or non-two-person conversations fail closed and require reviewed migration. Administrator/role changes require trusted code. Profile allowlist covers the observed signup, login-location, Settings email/phone and saved-gig writes; additional profile implementations must be verified in staging. Storage attachments, user-content rendering, admin queue consistency, account deletion and marketplace entitlement security remain unresolved.

## Verification follow-up and message rendering

- Added credential-free GitHub Actions checks on correction-branch pushes and pull requests. Local emulator network approval remained cancelled. The first CI attempt found a rules-file path setup error; pretest now copies the repository rules into the isolated emulator directory.
- Rule compilation and all five rules tests PASSED in https://github.com/Dixon101/digitask/actions/runs/34240249815 (commit 32c042f776b496450b8f9b44605a260de78b96e7). That run also passed all 14 existing regression tests. This supersedes the earlier unverified-rules status above.
- Message text, conversation previews, names, initials, unread counts, attachment names and notification text now escape HTML. Image attachment URLs accept HTTPS only and escape attribute characters. Two additional tests execute the actual renderers against injection strings; all 16 root regression tests pass locally.
- Browser preview attempt: the cloud browser rejected the workspace localhost URL with ERR_BLOCKED_BY_CLIENT. No browser sign-off on the changed pages is claimed. An accessible staging site using isolated Firebase services is needed for authenticated end-to-end tests.

Outstanding before security completion: administrator page initialization and account-status queue path/rules consistency; safe account-deletion lifecycle; remaining user-content rendering across other pages and email templates; Storage/paid-file permissions and entitlement checks. The Settings delete flow currently attempts an owner-denied profile deletion before Auth deletion; do not enable deletion by broadly opening profile-delete permissions.

Marketplace preparation: server code has featured-payment approval notifications but no general payment-provider verification implementation. Publishing, checkout, order and delivery work must establish one ownership schema and trusted payment/entitlement transitions, with sandbox tests before production. No real transaction or account deletion was attempted. No code, rules or functions have been deployed to production.

## Administrator status queue correction

- Both admin edit and moderation controls use one shared helper and the existing root auth_updates trigger path. Activation is queued as well as suspension/banning.
- Profile and queue writes use one atomic Firestore batch. Queue failures cannot silently leave a profile-only save. UI success messages explicitly say queued, not applied to Auth.
- Rules restrict queue access to administrators, validate status and target identity, and prohibit replacing an unprocessed request. Completed requests can be replaced with a new request. Only trusted server code marks requests processed.
- Added local helper tests and emulator cases for queue authorization and atomic rollback. All 18 root tests pass locally; CI checks the expanded seven-test rules suite.

Limits: this repairs request creation, not the full asynchronous lifecycle. Trigger duplicate/out-of-order execution and manual endpoint/queue coordination still need hardening before production. Failed pending requests require existing administrator recovery; do not clear processed flags or grant users queue access to unblock them. Browser integration and account-deletion/Storage work remain pending. The user confirmed only the live digitask001 project exists; isolated CI tests continue without a new Firebase project.

## Security lifecycle and Storage batch

- Status processing now reads current queue state, claims a transaction lease, verifies Auth changes, revokes suspended sessions and retries failures. Manual/recovery endpoints use the same queue instead of racing direct Auth writes.
- Reviewed account-deletion requests require recent owner authentication. The admin panel reviews requests; the server locks access before selective personal cleanup and Auth deletion. Retained shared/financial records are described honestly in the UI. Failed cleanup remains blocked and retries.
- Added default-deny Storage rules, image-only public previews, owner/participant checks and trusted buyer file grants. Users cannot forge purchase records or file grants. Private product uploads now store paths instead of public download links.
- Added read-only legacy file inventory tooling and SECURITY-RELEASE.md. No inventory, migration, deletion or deployment was run on production.

Validation: GitHub run https://github.com/Dixon101/digitask/actions/runs/34273467453 passed all 24 regression tests and all 12 Firestore/Storage tests on commit ebf35fe329b2381b7fc7f4128ddc29d5d15714bc. An additional local test verifies that paid uploads never request reusable URLs (25 root tests total). All five modified HTML pages pass extracted JavaScript syntax checks. Deployment, browser integration, cloud retries and legacy file migration remain required. The current implementation must not be represented as full erasure or production security sign-off.
# Phase 3 — publishing and listing ownership (2026-09-09)

- Publishing includes consistent seller/client ownership fields; rules reject forged ownership, sales, ratings and featuring.
- My Store reads canonical global products, persists edits, and archives instead of deleting purchased assets.
- Product cards tolerate missing counters and encode seller text; catalog uses uploaded previews and excludes unpublished vendor listings.
- Removed simulated file removal; replacement remains unavailable until purchase-safe versioning exists.
- Validation: 28 local automated tests pass; JavaScript syntax checks pass on all three changed pages. Added two emulator tests for publishing and ownership; CI result must be checked.
- Release limitations: no deployment or real transaction tests. Legacy per-user-only product copies need reconciliation before rollout. Detail-page availability, checkout, trusted payment verification, buyer file grants, other listing renderers and browser verification remain outstanding.
# Phase 3 — bank checkout settings batch

- Added an independently mounted, admin-gated bank fee/settings form in Admin Finance. Percentages convert to fractional rates, explicit zero is preserved, bank details are required and saves merge into canonical platformSettings.
- Disabled the legacy deposit save handler to prevent it overwriting the new settings with defaults. USDT/crypto configuration is outside this batch.
- Bank checkout uses fixed processing fees when configured, preserves compatibility with legacy percentage fees, calculates saved totals from numeric inputs rather than display text, and rejects duplicate submits/unpublished products.
- Removed automatic placeholder deposit settings creation and checkout fallback bank details.
- Validation: 31 local regression tests pass. No live deployment, browser verification, real payments or account writes.
- Syntax: checkout and new scripts pass. Admin Finance has a pre-existing duplicate loadAuditLogs declaration in its legacy module (confirmed against the parent commit); the new panel loads independently. Repair and browser-test the legacy finance module before release.
- Still pending: server-created immutable quotes/orders, independently verified bank receipts, atomic purchase grants and authenticated downloads, remaining fee consumers and legacy withdrawal controls. This batch is not payment verification or launch approval.
# Phase 3 — server bank orders and purchase access

- Added server-created bankOrders with immutable product/file/fee snapshots, expected-total checks, ownership validation and retry request IDs.
- Added administrator-confirmed bank receipts: requires exact amount, affirmative bank-account inspection and a unique receipt reference; approval, purchase entitlement and audit record commit together. This is manual bank reconciliation, not a bank API verification.
- New checkout bank submissions call the server. Admin Finance has an isolated review panel; My Store has an isolated bank-purchase download panel.
- Download callable checks revoked authentication, account locks/status, paid order and buyer ownership, then issues a one-minute bearer link. A copied link remains usable until it expires.
- Removed duplicate audit helpers/sample-log writes and added a compat adapter for missing Firebase function-style helpers.
- Correction to earlier diagnosis: duplicate declarations were in a classic script; checking it as a module incorrectly classified them as a syntax error. Missing SDK helper functions were an actual runtime problem. Syntax checks now respect each script type.
- Validation: 35 local tests pass, including price tampering, receipt reuse, duplicate approval, atomic failure and unauthorized downloads. Added emulator checks for server-only order/receipt/purchase writes.
- Release gates: coordinated functions/rules/pages deployment, signing permissions, CORS/browser integration, file existence/token migration and reconciliation with legacy orders. Seller balances/payouts, refunds and automated bank matching are not implemented by this batch. No live transactions or deployment performed.
# Phase 3 — seller accounting and reconciliation

- Administrator approval now commits an immutable bankLedger allocation, held seller balance, receipt, paid status, purchase access and audit record in one transaction.
- Uses integer kobo and validates that seller earnings + platform fee + processing fee equal the recorded bank receipt. Preserves the existing buyer-added fee model; seller earnings equal the product price.
- Concurrent retries credit once. Different orders accumulate credits transactionally. Invalid balances/totals and legacy paid orders without accounting require review rather than automatic balance rewriting.
- Ledger and balance writes are server-only, including for admin browsers. Admin approval remains the control that initiates credits.
- Added a compact accounting disclosure inside the existing bank review panel (latest 100 entries), and held-balance text inside the existing purchase panel. No stylesheet/layout redesign.
- Validation: 40 local tests pass. Added emulator seller/admin read and server-only write coverage. Browser verification and deployment remain pending.
- These are held bank-sale funds, not withdrawable balances. Legacy wallet/profile balances are unchanged. Payout release, refunds, disputed-fund handling and reconciliation of historic paid orders remain separate batches.
# Phase 3 — administrator bank payout records

- Added reserve/cancel/confirm callable for individual bank-sale orders. Admin membership, revoked-session verification, account status, held balance, order accounting and payout revision are checked before writes.
- Reservations move held earnings to reserved funds and snapshot verified recipient details. Completion requires the exact seller amount, explicit bank-transfer confirmation and a unique transfer reference. These calls record manual transfers; they never send money.
- Cancellation requires confirmation that no transfer was sent and a reason. Funds return to held; replacement reservations get a new revision so stale actions cannot cancel/confirm them.
- Balance movements, order/payout status, transfer-reference claim and audit records commit atomically. Lifetime earnings and immutable sale allocations are preserved.
- Admin controls sit within the existing bank panel using existing form/button classes. Seller balance text now separates held, reserved and paid. Browser/design verification remains pending.
- Validation: 45 local tests pass; new emulator coverage checks private payout records and server-only writes.
- Release limits: no deployment or real transfers. No extra withdrawal fees introduced. Refund/dispute state transitions, legacy dispute integration and historical payout reconciliation remain outstanding. Current checks block canonical non-resolved disputeStatus markers; they are not a complete dispute system.
# Phase 3 — bank dispute holds and full refund records

- Admins can open/release dispute holds and record completed full bank refunds using the existing finance control panel. Reasons and revision checks protect against stale decisions and preserve audit history.
- An open hold blocks new seller payout reservations and confirmations. Refunds require held earnings; reserved payouts must first be cancelled as unpaid, while completed payouts require separate recovery review.
- Refund amount equals the original buyer total, including both fee components. Unique outgoing transfer references share the payout namespace. Refund record, balance reversal, order/dispute status, purchase-access status and audit entry commit together.
- Original sale ledger and lifetime credited amounts remain intact; refunded seller earnings are tracked separately. New download requests are denied after refund; previously issued links may last up to 60 seconds and already downloaded files cannot be recalled.
- All actions record administrator-verified manual bank transfers; there is no automated refund transfer or bank API confirmation.
- Validation: 51 local tests pass, covering holds, release, full refund, duplicates, failed commits, amount/reference checks, payout conflicts and download denial. Added party-only reads/server-only writes emulator coverage.
- Release limitations: no deployment or browser/design verification. Partial refunds, completed-payout recovery, customer dispute intake, legacy dispute migration and consolidated reconciliation reporting remain pending.
# Phase 3 — customer bank dispute reporting

- Paid buyers can submit one immutable report per bank order from their purchase card. Ownership/status checks and revoked-session verification precede writes.
- A first report opens a canonical dispute hold atomically; existing admin holds are preserved. Duplicate reports cannot reopen resolved cases or replace the original complaint.
- Admin panel lists up to 100 open cases; loading an order shows its original customer report alongside payout/refund controls.
- Validation: 54 local tests pass; added report access-rule emulator coverage. Textarea/buttons reuse existing form classes.
- Browser check attempted against the corrected local page using Cloud Browser; navigation failed with net::ERR_BLOCKED_BY_CLIENT. No visual or browser integration pass is claimed. Requires an accessible isolated preview before deployment; live production remains unchanged.
- Remaining limitations: no attachments, customer follow-up thread, notifications or legacy dispute migration. Reports after completed payouts can flag a case but cannot recover money already transferred. Partial/post-payout refunds remain separate recovery work.
