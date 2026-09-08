// Write the profile change and Auth request together: neither can save alone.
export async function saveAdminUserUpdate({ db, doc, writeBatch }, userId, changes) {
  if (typeof userId !== 'string' || !userId.trim() || userId.includes('/')) {
    throw new Error('Select a valid user');
  }
  const { status, ...profileChanges } = changes;
  if (status !== undefined && !['active', 'suspended', 'banned'].includes(status)) {
    throw new Error('Invalid account status');
  }
  const batch = writeBatch(db);
  const timestamp = new Date().toISOString();
  batch.update(doc(db, 'artifacts', 'default-digitask-app', 'users', userId), {
    ...profileChanges, ...(status === undefined ? {} : { status }), updatedAt: timestamp
  });
  if (status !== undefined) {
    batch.set(doc(db, 'auth_updates', userId), {
      userId, status, processed: false, timestamp
    });
  }
  await batch.commit();
}
