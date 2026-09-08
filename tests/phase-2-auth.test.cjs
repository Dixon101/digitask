const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const authorization = require('../functions/adminAuthorization');

function harness({ member = true, tokenError = false, writeError = false, lookupError = false, pending = [] } = {}) {
  const calls = { writes: [], tokens: [], processed: 0, queries: 0 };
  const snapshot = { exists: true, data: () => ({ status: 'active' }) };
  const chain = {
    collection(name) { return name === 'admins' ? adminCollection : this; },
    doc() { return this; },
    async get() { return snapshot; },
    where() { calls.queries++; return { get: async () => ({ size: pending.length, docs: pending }) }; }
  };
  const adminCollection = { doc(uid) {
    assert.equal(uid, 'verified-admin');
    return { get: async () => { if (lookupError) throw Error('private database details'); return { exists: member }; } };
  } };
  const admin = {
    initializeApp() {},
    auth: () => ({
      async verifyIdToken(token, revoked) {
        calls.tokens.push([token, revoked]);
        if (tokenError) throw Error('private token details');
        return { uid: 'verified-admin' };
      },
      async updateUser(uid, update) {
        calls.writes.push([uid, update]);
        if (writeError) throw Error('private write details');
        return { uid, ...update };
      },
      async getUser() { return { disabled: true }; }
    }),
    firestore: Object.assign(() => chain, { FieldValue: { serverTimestamp: () => 'timestamp' } })
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../functions/index.js'), 'utf8'), {
    exports, console: { log() {}, error() {} },
    require(name) {
      if (name === 'firebase-admin') return admin;
      if (name === './adminAuthorization') return authorization;
      if (name === 'firebase-functions/v2/https') return { onRequest: (_, handler) => handler };
      if (name === 'firebase-functions/v2/firestore') return { onDocumentWritten: (_, handler) => handler };
      if (name.endsWith('Triggers')) return {};
      throw Error(name);
    }
  });
  async function invoke(name, { method = 'POST', token = 'Bearer test-token', body = { userId: 'target', status: 'suspended' } } = {}) {
    const res = { code: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await exports[name]({ method, get: () => token, body }, res);
    return res;
  }
  return { calls, exports, invoke };
}

for (const endpoint of ['forceUpdateUserAuth', 'processAllPendingUpdates']) {
  test(`${endpoint} rejects unauthenticated, revoked, non-admin and non-POST callers before work`, async () => {
    for (const [options, request, code] of [
      [{}, { token: '' }, 401], [{}, { token: 'Basic abc' }, 401],
      [{ tokenError: true }, {}, 401], [{ member: false }, {}, 403],
      [{}, { method: 'GET' }, 405], [{ lookupError: true }, {}, 500]
    ]) {
      const h = harness(options);
      const res = await h.invoke(endpoint, request);
      assert.equal(res.code, code);
      assert.equal(h.calls.writes.length, 0);
      assert.equal(h.calls.queries, 0);
      assert.ok(!JSON.stringify(res.data).includes('private'));
    }
  });
}

test('authorized status requests verify revocation and only accept supported statuses', async () => {
  for (const status of ['active', 'suspended', 'banned']) {
    const h = harness();
    assert.equal((await h.invoke('forceUpdateUserAuth', { body: { userId: 'target', status } })).code, 200);
    assert.deepEqual(h.calls.tokens, [['test-token', true]]);
    assert.equal(h.calls.writes[0][1].disabled, status !== 'active');
  }
  for (const body of [null, {}, { userId: 'target', status: 'typo' }, { userId: {}, status: 'active' }, { userId: ' ', status: 'active' }, { userId: 'a/b', status: 'active' }]) {
    const h = harness();
    assert.equal((await h.invoke('forceUpdateUserAuth', { body })).code, 400);
    assert.equal(h.calls.writes.length, 0);
  }
});

test('recovery reports failed updates accurately and never marks them processed', async () => {
  let processed = 0;
  const doc = { id: 'target', data: () => ({ status: 'suspended', processed: false }), ref: { update: async () => { processed++; } } };
  const failed = harness({ pending: [doc], writeError: true });
  const res = await failed.invoke('processAllPendingUpdates');
  assert.equal(res.data.results[0].status, 'error');
  assert.equal(res.data.message, 'Processed 0 of 1 updates');
  assert.equal(processed, 0);
  assert.ok(!JSON.stringify(res.data).includes('private'));
  const success = harness({ pending: [doc] });
  assert.equal((await success.invoke('processAllPendingUpdates')).data.results[0].status, 'processed');
  assert.equal(processed, 1);
});

test('Firestore trigger rejects invalid statuses and propagates Auth failures', async () => {
  for (const [options, status] of [[{}, 'unknown'], [{ writeError: true }, 'active']]) {
    const h = harness(options);
    await assert.rejects(h.exports.handleUserStatusUpdate({
      params: { userId: 'target' },
      data: { after: { data: () => ({ status }), ref: { update: async () => assert.fail('must not mark processed') } }, before: {} }
    }));
    if (status === 'unknown') assert.equal(h.calls.writes.length, 0);
  }
});
