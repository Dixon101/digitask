'use strict';
const ROOT = 'artifacts/default-digitask-app';
// Deliberately requires an administrator-reviewed request: marketplace records
// can involve counterparties, unsettled work and funds. Never delete them blindly.
function createAccountDeletionProcessor(admin) {
  const db = admin.firestore();
  return async function closeApprovedAccount(userId) {
    const request = db.doc(`${ROOT}/deletionRequests/${userId}`);
    const profile = db.doc(`${ROOT}/users/${userId}`);
    const lock = db.doc(`${ROOT}/accountLocks/${userId}`);
    const approved = await db.runTransaction(async tx => {
      const snapshot = await tx.get(request);
      if (!snapshot.exists || !['approved', 'processing'].includes(snapshot.data().status)) return false;
      const membership = await tx.get(db.doc(`${ROOT}/admins/${userId}`));
      const pending = await tx.get(db.doc(`auth_updates/${userId}`));
      if (membership.exists) throw Error('Administrator accounts need a separate transfer-of-access review');
      if (pending.exists && !pending.data().processed) throw Error('Account status update still pending');
      tx.set(lock, { reason: 'account-deletion', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.update(request, { status: 'processing' });
      return true;
    });
    if (!approved) return { status: 'skipped' };
    // Lock blocks client data access even while Auth tokens have not expired.
    try {
      await admin.auth().updateUser(userId, { disabled: true });
      await admin.auth().revokeRefreshTokens(userId);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    // Remove only personal account settings, not purchases/disputes/deliveries.
    for (const name of ['cart', 'payoutMethods', 'bankAccounts', 'notifications', 'user_conversations']) {
      await db.recursiveDelete(profile.collection(name));
    }
    await profile.set({ status: 'deleted', displayName: 'Deleted account', deletedAt: admin.firestore.FieldValue.serverTimestamp() });
    try { await admin.auth().deleteUser(userId); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    await request.update({ status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { status: 'completed' };
  };
}
module.exports = { createAccountDeletionProcessor };
