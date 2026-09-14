# Payment integration — batch 8, 2026-09-14

Actual bankOrders, bankPayouts and bankDisputes service methods execute against
Firestore emulator using firebase-admin 12.7.0. Tests require exact local host
127.0.0.1:8088 and initialize demo-digitask-security. Synthetic users, products,
references and monetary amounts only. No bank API or real transfer is involved.

Passing workflows:
1. Create order; reject ordinary-user approval; approve concurrently twice;
   assert one credit and purchase; reserve payout; reject stale reservation;
   confirm concurrently; verify zero held/reserved and correct paid balance.
2. Create second paid order; reserve it; reject reused outgoing bank reference;
   verify order remains reserved.
3. Create paid order; buyer reports problem; payout reservation rejected;
   concurrent refund calls; verify refunded order/purchase and one reduction in
   held funds; download rejected before any Storage signing operation.

Combined emulator suite: 23 tests pass, exit 0 (21 existing plus 2 workflow tests).
Local regressions: 67 pass. Service code required no correction for these cases.
CI uses committed isolated dependency lockfile and npm ci.

Scope: this is Firestore transaction integration of Cloud Functions business
logic, not Functions emulator or deployed callable HTTP testing. Auth token
validation, revoked sessions at HTTP boundary, actual signed URLs, file delivery,
real banks, browser checkout and production data compatibility remain unverified.
No deployment or real payment action performed. Resume from WORK-STATUS.md.
