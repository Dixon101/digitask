const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const fixture = require('./helpers/memory-admin.cjs');
const root = 'artifacts/default-digitask-app';
test('bank callables reject unauthenticated and revoked sessions before processing orders', async () => {
  const f = harness();
  for (const name of ['createBankOrder', 'approveBankOrder', 'downloadBankPurchase']) {
    await assert.rejects(f.exports[name]({ auth: null }));
    f.behavior.tokenError = true;
    await assert.rejects(f.exports[name]({ auth: { uid: 'admin' }, rawRequest: { get: () => 'Bearer revoked' }, data: {} }));
  }
  assert.ok(![...f.records.keys()].some(key => key.includes('/bankOrders/')));
});
function harness(member = true) {
  const f = fixture({ [root + '/users/u']: {}, ...(member ? { [root + '/admins/admin']: {} } : {}) });
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../functions/index.js'), 'utf8'), {
    exports, console: { log() {}, error() {} },
    require(name) {
      if (name === 'firebase-admin') return f.admin;
      if (name === 'firebase-functions/v2/https') return { onRequest: (_, handler) => handler, onCall: (_, handler) => handler, HttpsError: Error };
      if (name === 'firebase-functions/v2/firestore') return { onDocumentWritten: (_, handler) => handler };
      if (name.endsWith('Triggers')) return {};
      return require('../functions/' + name.replace('./', ''));
    }
  });
  async function invoke(name, { method = 'POST', token = 'Bearer test', body = { userId: 'u', status: 'banned' } } = {}) {
    const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await exports[name]({ method, get: () => token, body }, res);
    return res;
  }
  return { ...f, exports, invoke };
}
for (const endpoint of ['forceUpdateUserAuth', 'processAllPendingUpdates']) {
  test(endpoint + ' denies missing/invalid tokens, non-admins and non-POST before writes', async () => {
    for (const variant of ['missing', 'invalid', 'member', 'method']) {
      const f = harness(variant !== 'member');
      if (variant === 'invalid') f.behavior.tokenError = true;
      const result = await f.invoke(endpoint, { token: variant === 'missing' ? '' : 'Bearer test',
        method: variant === 'method' ? 'GET' : 'POST' });
      assert.equal(result.code, { missing: 401, invalid: 401, member: 403, method: 405 }[variant]);
      assert.equal(f.calls.auth.length, 0);
      assert.ok(!f.records.has('auth_updates/u'));
      assert.ok(!JSON.stringify(result.data).includes('private'));
    }
  });
}
test('manual endpoint queues valid requests without directly mutating Auth', async () => {
  const f = harness();
  assert.equal((await f.invoke('forceUpdateUserAuth')).code, 202);
  assert.deepEqual(f.calls.processed, [['test', true]]);
  assert.equal(f.calls.auth.length, 0);
  assert.equal(f.records.get('auth_updates/u').status, 'banned');
  assert.equal((await f.invoke('forceUpdateUserAuth', { body: { userId: 'u', status: 'typo' } })).code, 400);
  assert.equal((await f.invoke('forceUpdateUserAuth', { body: { userId: 'u', status: 'active' } })).code, 500);
  assert.equal(f.records.get('auth_updates/u').status, 'banned');
});
test('recovery wakes the queue and never reports Auth completion', async () => {
  const f = harness();
  f.records.set('auth_updates/u', { processed: false, status: 'banned' });
  const result = await f.invoke('processAllPendingUpdates');
  assert.equal(result.code, 202);
  assert.equal(result.data.results[0].status, 'queued');
  assert.equal(f.calls.auth.length, 0);
});
test('old event payload cannot override the current pending status', async () => {
  const f = harness();
  f.records.set('auth_updates/u', { processed: false, status: 'banned' });
  await f.exports.handleUserStatusUpdate({ params: { userId: 'u' }, data: {
    after: { exists: true, data: () => ({ processed: false, status: 'active' }) }
  } });
  assert.equal(f.calls.auth[0][1].disabled, true);
  await f.exports.handleUserStatusUpdate({ params: { userId: 'u' }, data: { after: { exists: false } } });
  assert.equal(f.calls.auth.length, 1);
});
