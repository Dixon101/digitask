# Admin controls and connected Firebase checks — 2026-09-14

Implemented: Admin Finance category add/rename panel using existing
artifacts/default-digitask-app/productCategories records. Publishing uses the
same collection as Store filters; loading/error/empty states block invalid form
submission. Renaming display names preserves IDs. No category deletion or
automatic live seeding. Failed editor saves retain values for retry.

Validation:
- 67 local regressions pass, including category validation and rendering.
- 21 emulator tests pass with Firebase SDK connections to local Firestore/Storage
  in demo-digitask-security. Includes two new multi-step workflow tests.
- Admin writes/renames category; seller sees changes; outsider cannot write or
  delete categories. Admin saves fees; user reads but cannot change them.
- Seller uploads private ZIP and public image preview, publishes product record;
  another user can read listing but cannot access private object metadata;
  unsigned user can access public preview. Seller cannot forge sales; admin can
  archive the listing. Synthetic files/identities only.
- Node syntax checks and git diff --check pass.

The suite completed with code 0. Emulator file content is synthetic bytes, not
an image-rendering test. Authentication is rules-test synthetic identity, not
Firebase Auth login. Cloud Functions are not included in this emulator command.
Browser editing, realtime UI refresh, screenshots and full checkout/payment/
delivery/payout/refund journeys remain unverified. No deployment performed.

Release compatibility: publishing now requires categories in the existing
collection; an empty collection shows a support message. Review live records
before release. Do not silently seed, delete or remap existing category IDs.
