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
