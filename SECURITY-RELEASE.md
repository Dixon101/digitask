# Security release requirements

This branch is not deployed. Use a coordinated release; do not deploy Storage rules alone.

## Account status

The trigger reads the current queue, uses a transactional five-minute lease, runs with a
60-second timeout, and retries failures. Manual update/recovery endpoints queue work
through that same worker. The manual update response is now HTTP 202, not synchronous
Auth completion. Recovery handles up to 100 pending requests per call. A failed request
remains pending, with a generic error, until retry succeeds. Suspension revokes refresh
tokens; previously issued ID tokens can remain valid until expiry. Test the deployed
Auth integration and retry behaviour before release; mocks do not prove cloud scheduling.

## Reviewed account deletion

Settings creates an owner-only request after authentication within five minutes.
Admin Users has a review panel. Approval requires review of unsettled work/payments.
The worker blocks Firestore/Storage account access, disables/revokes Auth, clears cart,
payout methods, bank accounts, notifications and the conversation index, replaces the
profile with a tombstone, then deletes Auth. Interrupted work retries idempotently.
Admin accounts are excluded; pending moderation must finish first.

Purchases, disputes, shared messages/work and uploaded files are intentionally retained
for review, not silently deleted. This is account closure with selective personal-data
cleanup, not complete erasure of every retained record. The owner must settle the retention
and deletion policy before promising full erasure. Rejected requests require support review.
Never approve a real request as a test. Test with disposable accounts in staging.

## File access and existing data

Storage rules distinguish image previews, private product files, chat attachments,
proofs and evidence. Buyers receive private-file access only through server-owned
fileGrants/{fileName}/users/{uid} documents with matching ownerId and active=true.
Creating a myPurchases record cannot grant download access. Phase 3 must connect
verified payment/delivery to these grants and authenticated file downloads.

New product publishing stores filePaths rather than reusable fileUrls. Existing files
and records were not migrated. Before release:

1. With authorized project access, run the read-only functions/scripts/audit-private-files.js
   inventory with explicit project and bucket. It prints counts, never tokens or URLs.
2. Review legacy ownership, move paid download URLs out of public product records and
   per-user product copies, revoke existing private download tokens, and adopt authenticated
   downloads. Do not mass-revoke tokens without a reviewed migration and download UI.
3. Backfill validated owner metadata for legacy support/order/chat files. Missing ownership
   fails closed. File names alone are not sufficient proof of ownership.
4. Configure cross-service Storage/Firestore permissions and required bucket CORS. Verify
   the actual bucket name in Firebase; repository pages contain legacy bucket references.
5. Test buyer delivery/downloads: legacy deliverables are currently owner/admin-only in
   the new rules, so buyer grants and UI must be wired before a release.

The inventory has not been run against production and no private files were accessed.
References: https://firebase.google.com/docs/storage/web/download-files
and https://firebase.google.com/docs/functions/firestore-events
