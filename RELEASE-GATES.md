# Digitask production release decision — 2026-09-14

Decision: NOT ready for a full marketplace production deployment. Release
preparation can begin now. Passing automated tests does not close the gates below.
No production deployment is included in the current correction batches.

## Must resolve before full release

1. Authentication/browser integration: actual callable HTTP token handling,
   revoked/locked accounts, admin category save/refresh, publishing, checkout,
   delivery/download and remaining mobile states. Current tests inject synthetic
   identities; payment tests invoke service methods directly.
2. Existing data and private files: perform authorized read-only inventory,
   validate bucket/configuration and legacy owner metadata, review old tokenized
   download URLs, prepare migration and verify buyer access. New restrictive
   Storage rules cannot safely be deployed alone. See SECURITY-RELEASE.md.
3. Publishing reliability: idempotent document creation for uncertain write
   results; trusted handling of unreferenced uploads; reconcile allowed file
   types in UI with Storage rules. Same-page upload cache does not solve reloads
   or uncertain acknowledgements. No seller-delete relaxation for paid files.
4. Operational compatibility: verify status/deletion trigger retries, indexes,
   Functions configuration and admin category records. Empty category collections
   now intentionally block new product publishing. Review all supported payment
   methods and legacy flows; isolate unfinished features before offering them.
5. Coordinated release: review exact changes and unresolved findings, establish
   recovery/rollback steps, deploy compatible functions/pages/rules together,
   then perform controlled production smoke checks without real financial tests.

## Can be a separate phase

Native mobile app conversion, optional new features and marketing enhancements
can follow a verified web launch. Browser/PWA behaviour needed by the released
web experience still belongs in release checks.

## Evidence, with limits

- 69 current local tests pass. Latest change denies locked/suspended/banned/deleted
  admins at account-management HTTP handlers. Callable UID/header tests pass with
  mocked verification; no real token or HTTP runtime verification claimed.
- Last completed connected suite: 23 Firestore/Storage emulator tests passed in
  batch 8. Not rerun in batch 9 (no rules or payment service changes).
- Prior 78 initial layout checks and focused interactive fixtures are historical
  samples, not a complete all-pages production browser sign-off.

A review can narrow a launch to verified features, but no such scope reduction
has been implemented or agreed in this batch. Do not label the full platform
launch-ready from a rough completion percentage.
