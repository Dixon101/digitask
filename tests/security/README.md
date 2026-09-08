# Isolated Firestore security tests

Use Node 22 and Java 17 or newer. From this directory run `npm install` then `npm test`.
The Firebase CLI runs Firestore and Storage emulators against `demo-digitask-security`
on localhost ports 8088 and 9199. No production credentials or production project are needed.

The tests load the repository rules and seed synthetic accounts/conversations with
rules temporarily disabled, then check allowed and denied operations as participants,
outsiders, signed-out visitors and an administrator. Fixtures never use live data.

The first run requires a network download of the Firestore emulator. Local execution
was blocked by cancelled network approval. GitHub Actions now runs this suite on
correction-branch pushes and pull requests, without Firebase credentials or deployment.
The setup copies the current repository rules into the isolated project before each run.
All five rules tests passed in run https://github.com/Dixon101/digitask/actions/runs/34240249815
on commit 32c042f776b496450b8f9b44605a260de78b96e7. This verifies rule compilation
and the covered synthetic cases, not production data compatibility or Storage security.

Before deployment, also confirm that existing conversations use exactly two
participant maps with distinct string `id` values. Other shapes fail closed for
ordinary users and need an administrator-reviewed migration. Confirm the messages
page's indexed per-document reads and profile/signup writes in a staging browser.
The suite now also covers private product/chat files, public image previews, payment
proof permissions, deletion review, account locks and forged purchase/file grants.
All 12 emulator tests passed in https://github.com/Dixon101/digitask/actions/runs/34273467453.
Legacy tokenized links, real Auth integration and browser rendering remain separate
release checks; see SECURITY-RELEASE.md.

References:
- https://firebase.google.com/docs/firestore/security/rules-fields
- https://docs.cloud.google.com/firestore/native/docs/security/test-rules-emulator
