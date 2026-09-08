const admin = require('firebase-admin');
admin.initializeApp();
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { authorizeAdminRequest, isValidStatusUpdate } = require('./adminAuthorization');
const { createStatusProcessor } = require('./statusProcessor');
const statusProcessor = createStatusProcessor(admin);
const closeApprovedAccount = require('./accountDeletion').createAccountDeletionProcessor(admin);
exports.onSupportTicketWrite = require('./supportTicketTriggers').onSupportTicketWrite;
exports.onFeaturedPaymentUpdate = require('./featuredPaymentTriggers').onFeaturedPaymentUpdate;

exports.handleAccountDeletion = onDocumentWritten({
  document: 'artifacts/default-digitask-app/deletionRequests/{userId}',
  region: 'europe-west1', retry: true, timeoutSeconds: 120, maxInstances: 1, concurrency: 1
}, async event => {
  if (event.data?.after.data()?.status !== 'approved') return;
  await closeApprovedAccount(event.params.userId);
});

exports.handleUserStatusUpdate = onDocumentWritten({
  document: 'auth_updates/{userId}', region: 'europe-west1',
  retry: true, timeoutSeconds: 60, maxInstances: 1, concurrency: 1
}, async event => {
  // Events are wake-up signals; the worker always reads current queue state.
  if (!event.data?.after.exists || event.data.after.data()?.processed) return;
  await statusProcessor.process(event.params.userId);
});

exports.forceUpdateUserAuth = onRequest({ region: 'europe-west1' }, async (req, res) => {
  try {
    if (!await authorizeAdminRequest(admin, req, res)) return;
    const { userId, status } = req.body || {};
    if (!isValidStatusUpdate(userId, status)) return res.status(400).json({ error: 'Invalid userId or status' });
    await statusProcessor.enqueue(userId, status);
    return res.status(202).json({ success: true, userId, status, message: 'Account status update queued' });
  } catch (error) {
    console.error('Unable to queue account update:', error);
    return res.status(500).json({ error: 'Unable to queue account update; check for a pending request' });
  }
});

exports.processAllPendingUpdates = onRequest({ region: 'europe-west1' }, async (req, res) => {
  try {
    if (!await authorizeAdminRequest(admin, req, res)) return;
    const pending = await admin.firestore().collection('auth_updates').where('processed', '==', false).limit(100).get();
    const results = [];
    for (const item of pending.docs) {
      // Recovery wakes the same worker, never mutating Auth concurrently.
      try {
        await item.ref.update({ retryRequestedAt: admin.firestore.FieldValue.serverTimestamp() });
        results.push({ id: item.id, status: 'queued' });
      } catch (error) {
        console.error('Unable to requeue account update:', error);
        results.push({ id: item.id, status: 'error' });
      }
    }
    return res.status(202).json({ message: 'Recovery requests queued (up to 100 per call)', results });
  } catch (error) {
    console.error('Unable to queue recovery:', error);
    return res.status(500).json({ error: 'Unable to queue recovery' });
  }
});
