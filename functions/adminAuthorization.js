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
  const root = admin.firestore().collection('artifacts').doc('default-digitask-app');
  const [membership, lock, profile] = await Promise.all([
    root.collection('admins').doc(identity.uid).get(),
    root.collection('accountLocks').doc(identity.uid).get(),
    root.collection('users').doc(identity.uid).get()
  ]);
  if (!membership.exists || lock.exists ||
      (profile.exists && ['suspended', 'banned', 'deleted'].includes(profile.data().status))) {
    res.status(403).json({ error: 'Active administrator access required' });
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
