# Digitask: resume here

Updated: 2026-09-14. Repository: Dixon101/digitask.
Remote correction branch: fix/phase-1-page-loading. Nothing in this batch deployed.

## Current checkpoint

Admin/category and emulator batch 7 complete. Admin Finance now offers category
add/rename; publishing uses the existing productCategories collection shared with
store filters. 67 local regressions and 21 connected Firestore/Storage emulator
tests pass locally. No production credentials, changes or deployment. Current
coverage details: qa/admin-workflow-checks.md.

## Steps completed batch 7 — 2026-09-14

1. Started isolated demo-digitask-security Firestore/Storage emulators locally;
   the earlier download/approval blocker no longer prevents this local suite.
2. Found store filters already consume productCategories but publishing used a
   separate hard-coded list. Removed that list and added authenticated realtime
   category subscription, selection preservation and loading/error/empty states.
3. Added category add/rename panel to Admin Finance using existing compat auth
   and database bindings. Admin membership checked, stale auth callbacks ignored,
   IDs validated, category text rendered through textContent, failed saves retain
   entries. Existing IDs can be renamed without changing linked product IDs.
4. Publishing refuses missing/unloaded/removed category selections. Added tests
   for unavailable states and category rename/selection preservation.
5. Added connected emulator checks: admin category create/rename visible to users;
   ordinary-user configuration writes rejected; fee setting read/write roles;
   seller private/preview upload, product publication, outsider private-file
   denial, public preview access, protected sales and admin archival.
6. Ran 67 local tests and 21 emulator tests successfully. Syntax/diff checks pass.
   Regenerated isolated preview CSS. Actual browser editor sign-in/save remains
   unverified; no claim that the whole production workflow has passed.

## Steps completed batch 6 — 2026-09-14

1. Reviewed Storage rules: product_files permits seller create/read but only
   admin update/delete. Kept this paid-content protection intact; no browser
   deletion cleanup added.
2. Added WeakMap upload cache keyed by File object and user/destination. Cache
   only acknowledged uploads; retry URL lookup without reuploading bytes. Retry
   after explicit document rejection reuses private paths and preview URLs.
3. Replaced timestamp/original-name paths with random UUID single-segment paths,
   preventing same-name timestamp collisions and embedded slash paths.
4. Set submitting forms inert and aria-busy while awaiting completion, restoring
   interaction after success or rejection. Existing visual styles retained.
5. Added tests for busy-state restoration, cached retry and same-name file paths;
   updated the existing private-upload test to include the cache declaration.
   All 65 tests pass. These remain VM/Firebase mocks, not live browser uploads.

## Steps completed batch 5 — 2026-09-14

1. Extended existing publishing harness to optionally execute the actual upload
   helper, with synthetic storage references and recorded upload/download calls.
2. Reproduced two failures: gig metadata could change after validation while an
   attachment uploaded; product metadata/previews could change during upload.
3. Both handlers now capture validated metadata and copies of selected file
   lists before awaiting uploads. Gig skills are copied as well. Saved records
   use that captured draft, with existing server-timestamp/ownership semantics.
4. Verified private product paths never call getDownloadURL; public previews do.
5. Verified product/gig upload rejection prevents document writes, retains draft
   and re-enables submit. Retry succeeds with one recorded document.
6. Verified preview URL failure and post-upload database failure keep the draft.
   Verified successful retry after an explicit database rejection.
7. Verified signed-out submission invokes neither uploads nor writes. Existing
   duplicate-click and reset-after-write tests still pass. Total: 62 tests pass.

## Steps completed batch 4 — 2026-09-14

1. Restarted the isolated preview and browser session. Kept the unrelated local
   digitask-logo.png change out of this batch.
2. Mobile Settings at 375 frame width: edit dialog opened, content/viewport
   measured 360/360, close button focused, Escape closed it and returned focus
   to Change Email. This resolves the previous timeout for that specific check.
3. Added My Gigs tab-handler extraction to the preview, with source-boundary
   assertions. Ran the actual tab handler for Active/Pending/Completed/Created/
   Actions at 375, 768, 1440; all 15 actions selected exactly the expected panel.
4. Added publishing UI, category helper and submit controllers to the isolated
   preview. Firebase imports use local stubs; auth emits no event and service
   reads/writes reject. My Gigs data loading and action handlers remain excluded.
5. Empty gig submit hit native category-required validation. Product submit with
   category/license selected showed title, description, price, files and preview
   errors. No record creation, file upload or account action was attempted.
6. Reproduced product category loss when switching away/back: title remained but
   category became empty. Preserved still-valid category selections in both
   publishing category-render functions. Confirmed Templates and draft title
   survive product/gig/product switching after correction. Final selector read
   timed out; subsequent DOM read confirmed the retained value and active form.
7. Verified direct ?form=product preview opens Upload Digital Product.
8. All 54 existing regression tests passed. No design or admin permissions changed.

## Steps completed batch 3

1. Ran the real Settings controller in the isolated preview, replacing Firebase
   imports with local no-op auth subscriptions and rejecting read/write stubs.
   No sign-in, account updates, payments or deletion requests performed.
2. Separate module delivery was blocked in the preview browser. Bundled the
   local fixture/controller inline; original Settings click handlers retained.
3. Confirmed edit-dialog Escape did not close it and opening did not focus it.
4. Added dialog semantics, accessible close labels, focus entry/Tab wrapping,
   Escape dismissal and focus restoration; retained existing reset behaviour.
5. Verified edit-dialog focus entry, reverse/forward Tab wrapping, Escape close
   and return to Change Email. Verified payout bank-name reset on reopening,
   profile menu open and outside-click dismissal in the desktop preview.
6. Corrected deletion summary text to describe administrator review/retention.
7. Fixed Admin Jobs sidebar Finance and Jobs hrefs to their existing routes.
   Verified route targets in source; live authenticated navigation not tested.
8. Ran all 54 regression tests. No visual theme or Firebase backend changed.

## Steps completed batch 2

1. Confirmed the previous batch was committed; preserved the unrelated local
   digitask-logo.png modification, excluding it from this batch.
2. Expanded the isolated preview from 3 to all 26 public HTML files; added
   single-page selection via the page query parameter.
3. Limited bank fixtures to My Store and Admin Finance. Original controllers
   remain stripped and CSP blocks connections/submissions.
4. Detected two hidden admin bodies. Added a preview-only body visibility
   override so their HTML layouts can be measured. Production authentication
   and visibility logic were not changed.
5. Found My Gigs overflow (657/375 phone; 1013/768 tablet). Constrained the
   tab container width so its existing horizontal scroll works inside the page.
6. Found Admin Dashboard overflow (875/360 phone; 875/753 tablet) and Admin
   Jobs overflow (1380/360 phone; 1380/753 tablet). Applied the same responsive
   sidebar/main/header structure used for Finance in the previous batch.
7. Wrapped Dashboard geolocation filters after the first correction left
   447/360 phone overflow. Final phone width is 360/360.
8. Re-measured all 78 layouts: visible bodies and no page horizontal overflow.
   Existing table/tab internal scrolling remains available. Viewed the desktop
   Dashboard screenshot: existing indigo sidebar, white cards and typography.
9. Ran the 54 local regression tests successfully. Regenerated preview CSS.
   No extra unit tests were added for these layout-only class changes.

## Exact next step

Next: test authenticated initialization/category loading and browser uploads
against an isolated emulator or controlled fixtures. Current tests inject a
synthetic user ID; they do not execute Firebase Auth or security rules.

Next server-side publishing work: idempotent document creation for uncertain
write outcomes and trusted orphan-upload cleanup. Current addDoc retries can
still duplicate records if a prior write succeeded but its acknowledgement was
lost. Do not clean up files after an ambiguous write without checking references.

Confirmed uploads now reuse bytes within this page session only. Reloading the
page, reselecting a file as a new File object or an upload with unknown outcome
can still create orphaned objects. Private product cleanup must remain trusted;
never loosen seller delete permissions to implement cleanup. Verify inert forms
and uploads in real browser/emulator integration, including file-picker/drop
behaviour and navigation during an upload.

Product categories now use admin-managed Firebase records. Verify the editor
and realtime publisher/store refresh in an authenticated browser. An empty
collection intentionally prevents new product publishing; review existing live
category IDs before release rather than auto-seeding or renaming live records.
Category existence is checked by publishing UI, not added as a new rules gate
in this batch. Other admin settings/legacy controls still need an inventory.
My Gigs tab checks cover selection only: search, sorting, loaded cards, delivery
and dispute modals still need tests. Settings account-update errors/retries,
payout/deletion dialog phone checks, support dialogs and screen-reader testing
remain pending. Continue responsive populated states, keyboard and image checks.

After UI interaction coverage, verify complete publishing/order/payment approval/
download/dispute/payout/refund journeys using synthetic data. Physical mobile
browsers and production deployment checks remain pending.

## Working constraints and reporting

Preserve existing visual design and administrator control. Keep small commits
with evidence, limitations and an updated checkpoint in this file. Changes are
on the correction branch; do not describe them as live. Do not use real purchases,
payments or customer-account changes as tests. Firebase project is digitask001;
a separate real test project is not available. Emulator setup is in tests/security.
Prior 75% estimate was rough, not a measured launch-readiness score; track the
remaining gates above rather than increasing a percentage after each batch.
