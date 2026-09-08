'use strict';
const { randomUUID } = require('node:crypto');
const { isValidStatusUpdate } = require('./adminAuthorization');
const ROOT = 'artifacts/default-digitask-app';
function createStatusProcessor(admin, { now = Date.now, leaseMs = 300000 } = {}) {
  const db = admin.firestore();
  async function enqueue(userId, status) {
    if (!isValidStatusUpdate(userId, status)) throw Error('Invalid account status');
    const queue = db.doc('auth_updates/' + userId);
    const profile = db.doc(ROOT + '/users/' + userId);
    await db.runTransaction(async tx => {
      const pending = await tx.get(queue);
      const user = await tx.get(profile);
      const locked = await tx.get(db.doc(ROOT + '/accountLocks/' + userId));
      if (!user.exists) throw Error('User profile not found');
      if (locked.exists) throw Error('Account is closed for deletion');
      if (pending.exists && !pending.data().processed) throw Error('Account update already pending');
      tx.update(profile, { status, updatedAt: new Date(now()).toISOString() });
      tx.set(queue, { userId, status, processed: false, timestamp: new Date(now()).toISOString() });
    });
    return { status: 'queued' };
  }
  async function process(userId) {
    if (!isValidStatusUpdate(userId, 'active')) throw Error('Invalid user');
    const queue = db.doc('auth_updates/' + userId);
    const profile = db.doc(ROOT + '/users/' + userId);
    const token = randomUUID();
    const claimed = await db.runTransaction(async tx => {
      const snap = await tx.get(queue);
      const locked = await tx.get(db.doc(ROOT + '/accountLocks/' + userId));
      if (!snap.exists || snap.data().processed) return null;
      if (locked.exists) throw Error('Account is closed for deletion');
      const data = snap.data();
      if (!isValidStatusUpdate(userId, data.status)) throw Error('Invalid pending status');
      if (data.leaseUntil > now()) throw Error('Account update is already processing');
      tx.update(queue, { processingToken: token, leaseUntil: now() + leaseMs });
      return data;
    });
    if (!claimed) return { status: 'skipped' };
    try {
      const user = await profile.get();
      if (!user.exists) throw Error('User profile not found');
      const disabled = claimed.status !== 'active';
      await admin.auth().updateUser(userId, { disabled });
      if (disabled) await admin.auth().revokeRefreshTokens(userId);
      const verified = await admin.auth().getUser(userId);
      if (verified.disabled !== disabled) throw Error('Auth status verification failed');
      await db.runTransaction(async tx => {
        const current = await tx.get(queue);
        if (!current.exists || current.data().processingToken !== token) throw Error('Processing lease changed');
        tx.update(queue, { processed: true, processedAt: admin.firestore.FieldValue.serverTimestamp(),
          leaseUntil: 0, processingToken: null, lastError: null });
        tx.update(profile, { status: claimed.status, authStatusSyncedAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      return { status: 'processed' };
    } catch (error) {
      // Preserve the lease on failure. Retries wait until it expires, avoiding a hot error loop.
      await db.runTransaction(async tx => {
        const current = await tx.get(queue);
        if (current.exists && current.data().processingToken === token) {
          tx.update(queue, { lastError: 'Account status processing failed' });
        }
      });
      throw error;
    }
  }
  return { enqueue, process };
}
module.exports = { createStatusProcessor };
