# Publishing QA batch 5 — 2026-09-14

Method: Node VM executes production validation, submit handlers and (in the new
integration-style cases) uploadFilesToStorage from the publishing HTML. Synthetic
user ID qa, fake file objects, mocked uploadBytes/getDownloadURL/addDoc; no real
Firebase SDK, credentials, uploads, network requests or deployed rules exercised.

| Scenario | Result |
| --- | --- |
| Gig fields/skills change while upload awaits | Failed before fix; passes after snapshot |
| Product metadata/preview selection changes while upload awaits | Failed before fix; passes after snapshot |
| Private product file and public preview upload | Private path saved; URL lookup only for preview |
| Product upload rejects, then retry | No first write/reset; inputs retained; retry succeeds |
| Preview URL lookup rejects | No document write; file selections retained; submit enabled |
| Signed-out gig/product submits | No uploads or writes |
| Gig attachment rejects, then retry | Draft retained; one owned gig saved on retry |
| Database explicitly rejects after uploads, then retry | Draft retained; one recorded document on retry |

Full suite: node --test tests/*.test.cjs — 62 pass (54 previous + 8 new).
Fix: capture metadata, copies of file selections and gig skills before first await.
Design, permissions and admin settings unchanged. Not deployed.

Limits: these checks model explicit rejected writes, not ambiguous network results
where a server write may have succeeded. Uploaded-file cleanup and retry reuse,
filename collision resistance, late edits during upload, real Auth/category load,
security-rule integration and browser upload behaviour remain pending. The earlier
browser fixture emits no auth state and cannot prove successful Firebase writes.
