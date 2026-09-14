# Interactive QA — 2026-09-13, batch 3

Environment: isolated Chrome preview, real Settings controller with Firebase
imports replaced by qa/settings-fixture.mjs. Auth subscriptions emit nothing;
service operations reject. CSP prohibits connections and form navigation.
Original inline event handlers and controller logic are retained. Fixture is
bundled in the HTML because separate module delivery was blocked. No credentials
entered or production records accessed. Original external assets remain blocked.

| Check | Observed result |
| --- | --- |
| Expand Profile Settings and open Change Email | Opens after expanding section |
| Before correction: Escape | Dialog remained open |
| After correction: focus on opening | Close edit dialog button focused |
| Shift+Tab from first control | Save Changes focused |
| Tab from Save Changes | Close edit dialog focused |
| Escape | Dialog closes; focus returns to Change Email |
| Add payout method, fill bank name, close, reopen | Bank name empty; no save attempted |
| Profile menu click | Menu opens |
| Click Settings heading outside menu | Menu closes |
| Edit dialog at 375/768/1440 frames | Incomplete: browser action timeout on phone; not passed |
| Local regression suite | 54 pass |

Changes: keyboard/focus management and dialog names in Settings, deletion summary
consistent with existing admin-review process, corrected Admin Jobs sidebar hrefs.
The phone interaction timeout does not prove a product bug. Retry that check next.
Full authentication, persistence, form success/failure and screen-reader testing
remain pending. My Gigs and publishing interactive browser tests remain pending.

## Batch 4 — 2026-09-14

- Mobile Settings 375px frame: opens edit dialog, focus enters close button,
  Escape closes and restores Change Email focus; document width 360/360. This
  resolves the earlier timeout for the edit dialog only, not every phone modal.
- My Gigs: all five tab selections at 375/768/1440 activate exactly the matching
  panel (15 actions). Preview extracts the unchanged handler from source and
  asserts boundaries. It does not initialize authentication, listeners or cards.
- Publishing: actual UI + submit controllers run with imports replaced by local
  fixtures. Auth emits no state, service calls reject; no network/data writes.
  Shared category helper runs but its network fetch is not invoked.
- Empty gig submit shows native category-required message. Selecting a product
  category/license and submitting empty data shows title/description/price/files/
  previews errors. This validates rejection only, not successful publishing.
- Found product category reset on form switch; corrected both render functions
  to preserve a still-valid selected category. Post-fix DOM confirmed Templates
  and the draft title survive switching back. A final selector evaluation timed
  out; subsequent DOM inspection confirmed the state. Gig selection needs a
  separate synthetic-auth check because no gig categories load in this fixture.
- Direct ?form=product opens the product form. Regression suite: 54 pass.

These are Chrome CSS-width checks, not physical iPhone/Android or Safari tests.
No deployment. Next checkpoint is in ../WORK-STATUS.md.
