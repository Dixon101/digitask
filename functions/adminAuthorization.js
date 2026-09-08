'use strict';

// Use the same administrator membership source as Firestore rules.
async function authorizeAdminRequest(admin, req, res) {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    res.status(405).json({ error: 'Use POST for this operation' });
    return false;
  }
  const match = /^Bearer (\S+)$/i.exec(req.get('Authorization') || '');
  if (!match) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  let identity;
  try {
    identity = await admin.auth().verifyIdToken(match[1], true);
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication' });
    return false;
  }
  const membership = await admin.firestore()
    .collection('artifacts').doc('default-digitask-app')
    .collection('admins').doc(identity.uid).get();
  if (!membership.exists) {
    res.status(403).json({ error: 'Administrator access required' });
    return false;
  }
  return true;
}

function isValidStatusUpdate(userId, status) {
  return typeof userId === 'string' && userId.trim().length > 0 &&
    userId.length <= 128 && !userId.includes('/') &&
    ['active', 'suspended', 'banned'].includes(status);
}

module.exports = { authorizeAdminRequest, isValidStatusUpdate };
