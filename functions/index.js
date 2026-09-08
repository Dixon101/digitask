const admin = require('firebase-admin');
admin.initializeApp();

// Import v2 functions
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { authorizeAdminRequest, isValidStatusUpdate } = require('./adminAuthorization');

// Import custom triggers
const { onSupportTicketWrite } = require('./supportTicketTriggers');
const { onFeaturedPaymentUpdate } = require('./featuredPaymentTriggers');

// Re-export so Firebase can discover them
exports.onSupportTicketWrite = onSupportTicketWrite;
exports.onFeaturedPaymentUpdate = onFeaturedPaymentUpdate;

// Helper function to mark an auth update as processed
async function markAsProcessed(docRef) {
  try {
    await docRef.update({
      processed: true,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Marked document ${docRef.id} as processed`);
  } catch (error) {
    console.error('Error marking document as processed:', error);
    throw error;
  }
}

/**
 * Cloud Function to handle user status updates
 * Listens for changes in the auth_updates collection and updates Firebase Auth accordingly
 */
// 2nd gen Firestore trigger (v2 API)
async function handleUserStatusUpdate(event) {
    const change = {
      after: event.data.after,
      before: event.data.before,
      params: { userId: event.params.userId }
    };
    const context = { params: event.params };
    const userId = context.params.userId;
    const updateData = change.after.data();
    
    // If document was deleted or marked as processed, do nothing
    if (!updateData || updateData.processed) {
      console.log(`No update needed for user ${userId}`);
      return null;
    }

    if (!isValidStatusUpdate(userId, updateData.status)) {
      throw new Error('Invalid account status update');
    }

    console.log(`Processing status update for user: ${userId}`, updateData);

    try {
      // Get the user's current status from Firestore
      const userDoc = await admin.firestore()
        .collection('artifacts')
        .doc('default-digitask-app')
        .collection('users')
        .doc(userId)
        .get();

      if (!userDoc.exists) {
        throw new Error('User profile not found');
      }

      const userData = userDoc.data();
      const newStatus = updateData.status;
      const currentStatus = userData.status;

      // Log current status comparison
      console.log(`Current status in Firestore: ${currentStatus}, New status: ${newStatus}`);
      
      // Always attempt to update Firebase Auth to ensure consistency
      const shouldDisable = newStatus === 'suspended' || newStatus === 'banned';
      
      console.log(`Setting user ${userId} disabled status to: ${shouldDisable} (status: ${newStatus})`);
      
      // Update Firebase Auth user
      const authUpdateResult = await admin.auth().updateUser(userId, {
        disabled: shouldDisable
      });
      
      console.log(`Successfully updated Firebase Auth for user ${userId}:`, {
        uid: authUpdateResult.uid,
        disabled: authUpdateResult.disabled,
        newStatus: newStatus
      });
      
      // Verify the update by fetching the user record
      const updatedUser = await admin.auth().getUser(userId);
      console.log(`Verification - User ${userId} is now disabled: ${updatedUser.disabled}`);
      
      // Mark the update as processed
      await markAsProcessed(change.after.ref);
      
      return null;

    } catch (error) {
      console.error(`Error updating user ${userId}:`, error);
      // Propagate failure so recovery does not report a failed update as processed.
      throw error;
    }
}

exports.handleUserStatusUpdate = onDocumentWritten(
  { document: 'auth_updates/{userId}', region: 'europe-west1' },
  handleUserStatusUpdate
);

/**
 * Manual trigger to force update a specific user's auth status
 */
exports.forceUpdateUserAuth = onRequest({ region: 'europe-west1' }, async (req, res) => {
  try {
    if (!await authorizeAdminRequest(admin, req, res)) return;
    const { userId, status } = req.body || {};
    
    if (!isValidStatusUpdate(userId, status)) {
      return res.status(400).json({ error: 'A valid userId and active, suspended or banned status are required' });
    }
    
    console.log(`Manual trigger: Forcing auth update for user ${userId} to status ${status}`);
    
    const shouldDisable = status === 'suspended' || status === 'banned';
    
    console.log(`Manual trigger: Setting user ${userId} disabled status to: ${shouldDisable} (status: ${status})`);
    
    // Update Firebase Auth user
    const authUpdateResult = await admin.auth().updateUser(userId, {
      disabled: shouldDisable
    });
    
    // Verify the update
    const updatedUser = await admin.auth().getUser(userId);
    
    console.log(`Manual trigger completed for user ${userId}:`, {
      disabled: updatedUser.disabled,
      status: status
    });
    
    res.status(200).json({
      success: true,
      userId: userId,
      status: status,
      disabled: updatedUser.disabled,
      message: `User ${userId} auth status updated successfully`
    });
    
  } catch (error) {
    console.error('Error in forceUpdateUserAuth:', error);
    res.status(500).json({
      error: 'Unable to update account status'
    });
  }
});

/**
 * Helper function to process all pending updates (useful for initial setup or recovery)
 */
// v2 HTTP function
exports.processAllPendingUpdates = onRequest({ region: 'europe-west1' }, async (req, res) => {
  try {
    if (!await authorizeAdminRequest(admin, req, res)) return;
    const snapshot = await admin.firestore()
      .collection('auth_updates')
      .where('processed', '==', false)
      .get();

    console.log(`Found ${snapshot.size} pending updates to process`);
    
    const results = [];
    for (const doc of snapshot.docs) {
      try {
        // Manually trigger the update handler for each document
        await handleUserStatusUpdate({
          data: {
            after: { exists: true, data: () => doc.data(), ref: doc.ref },
            before: { exists: true, data: () => doc.data() },
            params: { userId: doc.id }
          },
          params: { userId: doc.id }
        });
        results.push({ id: doc.id, status: 'processed' });
      } catch (error) {
        console.error(`Error processing ${doc.id}:`, error);
        results.push({ id: doc.id, status: 'error', error: 'Account update failed' });
      }
    }

    res.status(200).json({
      message: `Processed ${results.filter(result => result.status === 'processed').length} of ${results.length} updates`,
      results: results
    });
  } catch (error) {
    console.error('Error in processAllPendingUpdates:', error);
    res.status(500).json({
      error: 'Unable to process account updates'
    });
  }
});
