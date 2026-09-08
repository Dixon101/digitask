# Isolated Firestore security tests

Use Node 22 and Java 17 or newer. From this directory run `npm install` then `npm test`.
The Firebase CLI runs only the Firestore emulator against `demo-digitask-security`
on localhost port 8088. No production credentials or production project are needed.

The tests load the repository rules and seed synthetic accounts/conversations with
rules temporarily disabled, then check allowed and denied operations as participants,
outsiders, signed-out visitors and an administrator. Fixtures never use live data.

The first run requires a network download of the Firestore emulator. In the agent
workspace this run was blocked by cancelled network approval; the rules tests have
not yet passed or provided a compilation check. Passing the existing root tests is
not a substitute for running this suite.

Before deployment, also confirm that existing conversations use exactly two
participant maps with distinct string `id` values. Other shapes fail closed for
ordinary users and need an administrator-reviewed migration. Confirm the messages
page's indexed per-document reads and profile/signup writes in a staging browser.
Attachment Storage rules and user-content rendering are outside this suite.

References:
- https://firebase.google.com/docs/firestore/security/rules-fields
- https://docs.cloud.google.com/firestore/native/docs/security/test-rules-emulator
