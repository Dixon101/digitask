const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./helpers/memory-admin.cjs');
const { createStatusProcessor } = require('../functions/statusProcessor');
const { createAccountDeletionProcessor } = require('../functions/accountDeletion');
const root = 'artifacts/default-digitask-app';
const user = root + '/users/u';
const pending = { userId: 'u', status: 'banned', processed: false, timestamp: 'request-1' };

test('worker reads latest request, ignores completed duplicates, and revokes suspended sessions', async () => {
  const f = fixture({ [user]: { status: 'banned' }, 'auth_updates/u': pending });
  const p = createStatusProcessor(f.admin);
  assert.equal((await p.process('u')).status, 'processed');
  assert.equal((await p.process('u')).status, 'skipped');
  assert.equal(f.calls.auth.length, 1);
  assert.deepEqual(f.calls.revocations, ['u']);
  await p.enqueue('u', 'active');
  await p.process('u');
  assert.equal(f.calls.auth[1][1].disabled, false);
});
test('concurrent workers and manual requests cannot replace or process a leased request', async () => {
  const f = fixture({ [user]: {}, 'auth_updates/u': pending });
  let release;
  f.behavior.authWait = new Promise(resolve => { release = resolve; });
  const p = createStatusProcessor(f.admin);
  const first = p.process('u');
  // Wait until the actual Auth operation starts; no wall-clock sleeps.
  while (!f.calls.auth.length) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(p.process('u'), /already processing/);
  await assert.rejects(p.enqueue('u', 'active'), /already pending/);
  release(); await first;
  assert.equal(f.calls.auth.length, 1);
});
test('failed workers preserve pending state and recover after lease expiry', async () => {
  const f = fixture({ [user]: {}, 'auth_updates/u': pending });
  let time = 1000;
  const p = createStatusProcessor(f.admin, { now: () => time });
  f.behavior.authError = true;
  await assert.rejects(p.process('u'));
  assert.equal(f.records.get('auth_updates/u').processed, false);
  await assert.rejects(p.process('u'), /already processing/);
  time += 300001; f.behavior.authError = false;
  assert.equal((await p.process('u')).status, 'processed');
});
test('Auth verification mismatch is not marked complete; locked accounts cannot reactivate', async () => {
  const f = fixture({ [user]: {}, 'auth_updates/u': pending });
  f.behavior.verifyMismatch = true;
  await assert.rejects(createStatusProcessor(f.admin).process('u'), /verification/);
  assert.equal(f.records.get('auth_updates/u').processed, false);
  f.records.set(root + '/accountLocks/u', {});
  await assert.rejects(createStatusProcessor(f.admin).enqueue('u', 'active'), /closed/);
});
test('deletion requires approval and preserves transaction records', async () => {
  const request = root + '/deletionRequests/u';
  const f = fixture({ [user]: { email: 'private@example.test' }, [request]: { status: 'requested' },
    [user + '/cart/item']: {}, [user + '/myPurchases/purchase']: { price: 50 } });
  const close = createAccountDeletionProcessor(f.admin);
  assert.equal((await close('u')).status, 'skipped');
  f.records.set(request, { status: 'approved' });
  await close('u');
  assert.ok(f.records.has(root + '/accountLocks/u'));
  assert.equal(f.records.get(user).email, undefined);
  assert.ok(f.records.has(user + '/myPurchases/purchase'));
  assert.ok(!f.records.has(user + '/cart/item'));
  assert.ok(f.calls.deletes.includes('auth/u'));
  assert.equal((await close('u')).status, 'skipped');
});
test('cleanup failures retain deletion lock and can resume without false completion', async () => {
  const request = root + '/deletionRequests/u';
  const f = fixture({ [user]: {}, [request]: { status: 'approved' } });
  const close = createAccountDeletionProcessor(f.admin);
  f.behavior.cleanupError = true;
  await assert.rejects(close('u'));
  assert.ok(f.records.has(root + '/accountLocks/u'));
  assert.equal(f.records.get(request).status, 'processing');
  assert.ok(!f.calls.deletes.includes('auth/u'));
  f.behavior.cleanupError = false; await close('u');
  assert.equal(f.records.get(request).status, 'completed');
});
