const admin = require('firebase-admin');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');

/**
 * Helper to send an email using SendGrid (or similar SMTP provider)
 * You must set SENDGRID_API_KEY as an environment variable in Firebase Functions config
 */
function getSendGrid() {
  const key = process.env.SENDGRID_API_KEY;
  if (!key || !key.startsWith('SG.')) {
    logger.warn('SENDGRID_API_KEY missing or invalid; email notifications will be skipped.');
    return null;
  }
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(key);
  return sgMail;
}

// Utility: send email
async function sendEmail(to, subject, html) {
  const sgMail = getSendGrid();
  if (!sgMail) return;
  const msg = { to, from: 'admin@thedigitask.com', subject, html };
  await sgMail.send(msg);
}

// Utility: create in-app notification
async function createNotification(userId, notif) {
  const notifRef = admin.firestore().collection('artifacts').doc('default-digitask-app').collection('notifications').doc();
  await notifRef.set({
    userId,
    ...notif,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Firestore trigger: on featured payment approved or rejected
 * - Notify user via email and in-app notification
 */
exports.onFeaturedPaymentUpdate = onDocumentUpdated({
  document: 'artifacts/default-digitask-app/featuredPayments/{paymentId}',
  region: 'europe-west1',
  secrets: ['SENDGRID_API_KEY', 'PRIMARY_ADMIN_EMAIL'],
}, async (event) => {
    const { paymentId } = event.params;
    const before = event.data.before.data();
    const after = event.data.after.data();
    
    // Only send notification when status changes to approved or rejected
    if (before.status === after.status) {
      return null;
    }
    
    if (after.status !== 'approved' && after.status !== 'rejected') {
      return null;
    }
    
    const db = admin.firestore();
    
    // Get user data
    const userDoc = await db.collection('artifacts').doc('default-digitask-app').collection('users').doc(after.userId).get();
    if (!userDoc.exists) {
      console.error(`User ${after.userId} not found`);
      return null;
    }
    
    const userData = userDoc.data();
    
    // Determine payment type (gig or product)
    const paymentType = after.gigId ? 'gig' : 'product';
    const itemId = after.gigId || after.productId;
    
    // Get item data
    let itemData = null;
    let itemTitle = '';
    
    if (itemId) {
      const itemRef = after.gigId 
        ? db.collection('artifacts').doc('default-digitask-app').collection('gigs').doc(itemId)
        : db.collection('artifacts').doc('default-digitask-app').collection('products').doc(itemId);
        
      const itemDoc = await itemRef.get();
      if (itemDoc.exists) {
        itemData = itemDoc.data();
      }
      
      itemTitle = itemData ? (itemData.title || itemData.name || itemId) : 'Unknown Item';
    }
    
    // Create notification message
    const statusText = after.status === 'approved' ? 'approved' : 'rejected';
    const notificationMessage = `Your featured payment request for ${itemTitle} has been ${statusText}.`;
    
    // Email content
    const emailSubject = `Featured Payment ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`;
    const emailBody = `
      <p>Hello ${userData.displayName || userData.email},</p>
      <p>Your featured payment request for <b>${itemTitle}</b> has been ${statusText}.</p>
      ${after.status === 'approved' 
        ? '<p>Your item will now be featured on the platform.</p>' 
        : `<p>Reason: ${after.rejectionReason || 'Not specified'}</p>`}
      <p>Thank you for using Digitask!</p>
    `;
    
    // Send email notification
    if (userData.email) {
      try {
        await sendEmail(userData.email, emailSubject, emailBody);
      } catch (error) {
        console.error('Error sending email:', error);
      }
    }
    // Also notify primary admin
    try {
      const primaryAdmin = process.env.PRIMARY_ADMIN_EMAIL || 'admin@thedigitask.com';
      await sendEmail(primaryAdmin, `User ${statusText}: Featured Payment`, `User ${userData.email || userData.displayName || after.userId} ${statusText} for ${itemTitle}.`);
    } catch (e) {
      logger.warn('Error sending admin email (non-fatal):', e?.message);
    }
    
    // Create in-app notification
    try {
      await createNotification(after.userId, {
        title: `Featured Payment ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`,
        message: notificationMessage,
        type: 'featured_payment',
        paymentId,
      });
    } catch (error) {
      console.error('Error creating notification:', error);
    }
    
    // If approved, update the item to be featured
    if (after.status === 'approved' && itemId) {
      try {
        const itemRef = after.gigId 
          ? db.collection('artifacts').doc('default-digitask-app').collection('gigs').doc(itemId)
          : db.collection('artifacts').doc('default-digitask-app').collection('products').doc(itemId);
          
        await itemRef.update({
          featured: true,
          featuredAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.error('Error updating item featured status:', error);
      }
    }
    
    // If rejected, update the item to remove featured status
    if (after.status === 'rejected' && itemId) {
      try {
        const itemRef = after.gigId 
          ? db.collection('artifacts').doc('default-digitask-app').collection('gigs').doc(itemId)
          : db.collection('artifacts').doc('default-digitask-app').collection('products').doc(itemId);
          
        await itemRef.update({
          featured: false,
        });
      } catch (error) {
        console.error('Error updating item featured status:', error);
      }
    }
    
    return null;
  });
