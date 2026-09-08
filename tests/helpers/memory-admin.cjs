// Transactional in-memory fixture for server failure/duplicate-delivery tests.
module.exports = function memoryAdmin(seed = {}) {
  const records = new Map(Object.entries(seed));
  const calls = { auth: [], deletes: [], revocations: [], processed: [], queries: 0 };
  const behavior = {};
  const authUsers = new Map();
  const snapshot = path => ({ exists: records.has(path), data: () => structuredClone(records.get(path)), ref: reference(path) });
  function reference(path) {
    return { path, id: path.split('/').pop(), get: async () => snapshot(path),
      collection: name => reference(path + '/' + name),
      update: async data => { if (behavior.persistenceError) throw Error('private persistence detail'); records.set(path, { ...records.get(path), ...data }); },
      set: async data => { records.set(path, structuredClone(data)); },
      doc: name => reference(path + '/' + name),
      where: () => ({ limit: () => ({ get: async () => {
        calls.queries++;
        return { docs: [...records].filter(([key, data]) => key.startsWith(path + '/') && data.processed === false)
          .map(([key, data]) => ({ ...reference(key), ref: reference(key), data: () => data })) };
      } }) }) };
  }
  let serial = Promise.resolve();
  const db = { doc: reference, collection: reference,
    runTransaction(callback) {
      const run = serial.then(async () => {
        const writes = [];
        const result = await callback({ get: async ref => snapshot(ref.path),
          update: (ref, data) => writes.push([ref.path, data, true]), set: (ref, data) => writes.push([ref.path, data, false]) });
        if (behavior.commitError) throw Error('private commit detail');
        for (const [path, data, merge] of writes) records.set(path, structuredClone(merge ? { ...records.get(path), ...data } : data));
        return result;
      });
      serial = run.catch(() => {});
      return run;
    },
    async recursiveDelete(ref) {
      if (behavior.cleanupError) throw Error('cleanup failed');
      calls.deletes.push(ref.path);
      for (const key of records.keys()) if (key.startsWith(ref.path + '/')) records.delete(key);
    }
  };
  const auth = {
    async verifyIdToken(token, revoked) {
      calls.processed.push([token, revoked]);
      if (behavior.tokenError) throw Error('private token detail');
      return { uid: 'admin' };
    },
    async updateUser(uid, data) {
      calls.auth.push([uid, data]);
      if (behavior.authWait) await behavior.authWait;
      if (behavior.authError) throw Error('private Auth detail');
      authUsers.set(uid, data); return { uid, ...data };
    },
    async getUser(uid) { return behavior.verifyMismatch ? { disabled: false } : authUsers.get(uid); },
    async revokeRefreshTokens(uid) { calls.revocations.push(uid); },
    async deleteUser(uid) { calls.deletes.push('auth/' + uid); }
  };
  return { records, calls, behavior, admin: { initializeApp() {}, auth: () => auth,
    firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'server-time' } }) } };
};
