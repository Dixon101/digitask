const admin = require('firebase-admin');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');

/**
 * Helper to send an email using SendGrid (or similar SMTP provider)
 * You must set SENDGRID_API_KEY as an environment variable in Firebase Functions config
 */
// Defer SendGrid initialization until runtime and only if key is valid
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
  if (!sgMail) return; // Skip silently if no key
  const msg = { to, from: 'support@thedigitask.com', subject, html };
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
 * Firestore trigger: on support ticket created or updated
 * - If new ticket: notify admin(s) via email and in-app notification
 * - If ticket updated (status/response): notify user via email and in-app notification
 */
exports.onSupportTicketWrite = onDocumentWritten({
  document: 'artifacts/default-digitask-app/supportTickets/{ticketId}',
  region: 'europe-west1',
  secrets: ['SENDGRID_API_KEY', 'PRIMARY_ADMIN_EMAIL'],
}, async (event) => {
  const { ticketId } = event.params;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const before = event.data.before.exists ? event.data.before.data() : null;
  if (!after) return null; // deleted

  const db = admin.firestore();

  // Admin notification on new ticket
  if (!before) {
    // New ticket created
    // Find admin user(s) at artifacts/default-digitask-app/admins
    const adminsSnap = await db
      .collection('artifacts').doc('default-digitask-app')
      .collection('admins')
      .get();
    const adminEmails = adminsSnap.docs.map(doc => doc.data().email).filter(Boolean);
    // Always include primary admin email if configured
    const primaryAdmin = process.env.PRIMARY_ADMIN_EMAIL || 'admin@thedigitask.com';
    const uniqueEmails = Array.from(new Set([...adminEmails, primaryAdmin]));
    for (const email of uniqueEmails) {
      await sendEmail(
        email,
        `New Support Ticket: ${after.subject}`,
        `<p>A new support ticket has been submitted by ${after.userEmail || 'a user'}.</p><p>Subject: <b>${after.subject}</b><br>Message: ${after.message || ''}</p>`
      );
    }
    // In-app notification for admins (one per admin)
    for (const adminDoc of adminsSnap.docs) {
      await createNotification(adminDoc.id, {
        title: 'New Support Ticket',
        message: `A new support ticket was submitted: ${after.subject}`,
        type: 'support',
        ticketId,
      });
    }
  } else {
    // Ticket updated (status or response)
    if (after.userId && after.userEmail) {
      await sendEmail(
        after.userEmail,
        `Update on Your Support Ticket: ${after.subject}`,
        `<p>Your support ticket has been updated.<br>Subject: <b>${after.subject}</b><br>Status: <b>${after.status || 'updated'}</b></p>`
      );
      await createNotification(after.userId, {
        title: 'Support Ticket Update',
        message: `Your support ticket was updated: ${after.subject}`,
        type: 'support',
        ticketId,
      });
    }
  }
  return null;
});
