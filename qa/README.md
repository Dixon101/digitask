# Isolated responsive preview

This is a layout/fixture harness, not a staging Firebase project or an end-to-end test.

Run npm ci --ignore-scripts, then npm run qa:styles. The dev script serves the
preview through the supervised browser-preview runner. All production scripts
are stripped from the served HTML; only the selected bank UI scripts execute
against fixtures. CSP blocks connections and form submissions. No real Auth,
Firestore, Functions, Storage, customer records or payment providers are used.
The production Firebase hosting directory remains public; qa is not deployed.

## Observed checks — 2026-09-13

Chrome rendered My Store, Admin Finance and checkout inside frames set to
375, 768 and 1440 CSS pixels. Scrollbars reduced content viewports to 360, 753
and 1425 pixels. This checks responsive CSS, not real iOS/Android devices.

| Page | Phone overflow before | Tablet overflow before | After correction |
| --- | --- | --- | --- |
| My Store | None | None | None at all three widths |
| Admin Finance | 831px content / 360px viewport | 1135px / 753px | None at all three widths |
| Checkout | None | None | None at all three widths |

Corrections: stacked admin sidebar below the desktop breakpoint, constrained
main width, wrapped finance header, placed new bank panels within main content,
and matched bank form/button/card classes to existing indigo controls.

Expanded the phone payout controls and inspected the rendered screenshot.
Loaded the sample order in the admin form. Submitted a sample customer report
against the deliberately failing fixture: the error was visible and the submit
button re-enabled with the entered text retained. The 54 existing local
regression tests passed after the visual corrections.

## What is not verified

Original page controllers are not executing here: login, tabs, cart, checkout
submission and real data loading are not end-to-end tested. Some original
loading labels remain. Remote images are blocked, so asset completeness is
not established. Only the new selected controls use sample data.

Next passes: remaining pages and states; keyboard/focus and text enlargement;
real mobile-browser coverage; emulator-connected Auth/Firestore/Functions/
Storage journeys; error/retry paths for ordering, approval, downloads, disputes,
payouts and refunds. No live financial actions should be used as a test.

## Batch 2 — all initial page layouts

The preview now enumerates all 26 public HTML files. Add `?page=<basename>` to
inspect one page at all three widths. A preview-only body display override
reveals admin HTML normally hidden until authentication. It does not test auth.

All 78 initial-layout measurements now have content width equal to viewport
width. See layout-measurements-2026-09-13.json and ../WORK-STATUS.md for exact
results, discovered defects, corrections and the next checkpoint. My Gigs,
Admin Dashboard and Admin Jobs received responsive class corrections. Existing
54 local regression tests passed. Original controllers and remote assets remain
excluded: this is not interactive or full visual/functional sign-off.
