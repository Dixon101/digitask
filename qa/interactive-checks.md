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
