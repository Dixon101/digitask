const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const scope = {};
vm.createContext(scope);
vm.runInContext(fs.readFileSync(require.resolve('../public/js/admin-user-updates.js'), 'utf8').replace('export async function', 'async function'), scope);
function fixture(fail = false) {
  const writes = [];
  let commits = 0;
  return { writes, get commits() { return commits; }, api: { db: {}, doc: (_, ...path) => path.join('/'), writeBatch: () => ({
    update: (path, data) => writes.push({ path, data }), set: (path, data) => writes.push({ path, data }),
    commit: async () => { commits++; if (fail) throw Error('denied'); }
  }) } };
}
test('all account statuses atomically save profile and queue at the trigger path', async () => {
  for (const status of ['active', 'suspended', 'banned']) {
    const f = fixture();
    await scope.saveAdminUserUpdate(f.api, 'user', { status, displayName: 'Updated' });
    assert.equal(f.commits, 1);
    assert.equal(f.writes.length, 2);
    assert.equal(f.writes[0].path, 'artifacts/default-digitask-app/users/user');
    assert.equal(f.writes[1].path, 'auth_updates/user');
    assert.equal(f.writes[1].data.status, status);
    assert.equal(f.writes[1].data.processed, false);
  }
});
test('invalid statuses perform no writes; failed batch saves reject', async () => {
  const invalid = fixture();
  await assert.rejects(scope.saveAdminUserUpdate(invalid.api, 'user', { status: 'typo' }));
  assert.equal(invalid.writes.length, 0);
  const failed = fixture(true);
  await assert.rejects(scope.saveAdminUserUpdate(failed.api, 'user', { status: 'active' }), /denied/);
  const profile = fixture();
  await scope.saveAdminUserUpdate(profile.api, 'user', { displayName: 'Edited' });
  assert.equal(profile.writes.length, 1);
});
