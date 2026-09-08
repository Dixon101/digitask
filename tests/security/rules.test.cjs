const { test, before, after } = require('node:test');
const { readFileSync } = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, writeBatch } = require('firebase/firestore');
let env;
const root = 'artifacts/default-digitask-app';
const conversation = { participants: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }] };
const db = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
const ref = (uid, path) => doc(db(uid), `${root}/${path}`);
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-digitask-security', firestore: {
    host: '127.0.0.1', port: 8088, rules: readFileSync('../../firestore.rules', 'utf8')
  } });
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await setDoc(doc(store, `${root}/admins/admin`), {});
    await setDoc(doc(store, `${root}/users/alice`), { fullName: 'Alice', availableBalance: 50, status: 'suspended' });
    await setDoc(doc(store, `${root}/conversations/private`), conversation);
    await setDoc(doc(store, `${root}/conversations/private/messages/original`), { senderId: 'alice', text: 'Hello', isRead: false });
    await setDoc(doc(store, `${root}/conversations/malformed`), { participants: [] });
  });
});
after(async () => { if (env) await env.cleanup(); });

test('only admins queue valid account updates and pending requests cannot be replaced', async () => {
  const request = { userId: 'queued', status: 'suspended', processed: false, timestamp: new Date().toISOString() };
  for (const uid of ['alice', null]) {
    await assertFails(setDoc(doc(db(uid), 'auth_updates/queued'), request));
    await assertFails(getDoc(doc(db(uid), 'auth_updates/queued')));
  }
  await assertFails(setDoc(doc(db('admin'), 'auth_updates/wrong-id'), request));
  await assertFails(setDoc(doc(db('admin'), 'auth_updates/queued'), { ...request, status: 'typo' }));
  await assertSucceeds(setDoc(doc(db('admin'), 'auth_updates/queued'), request));
  await assertFails(setDoc(doc(db('admin'), 'auth_updates/queued'), { ...request, status: 'active' }));
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'auth_updates/queued'), { processed: true, processedAt: new Date() });
  });
  await assertSucceeds(setDoc(doc(db('admin'), 'auth_updates/queued'), { ...request, status: 'active' }));
});

test('a denied status request rolls back the accompanying profile edit', async () => {
  const store = db('admin');
  const account = doc(store, `${root}/users/atomic`);
  await assertSucceeds(setDoc(account, { status: 'active' }));
  const batch = writeBatch(store);
  batch.update(account, { status: 'suspended' });
  batch.set(doc(store, 'auth_updates/atomic'), { userId: 'atomic', status: 'invalid', processed: false, timestamp: '' });
  await assertFails(batch.commit());
  require('node:assert/strict').equal((await getDoc(account)).data().status, 'active');
});

test('only participants and administrators read a conversation and its messages', async () => {
  for (const uid of ['alice', 'bob', 'admin']) {
    await assertSucceeds(getDoc(ref(uid, 'conversations/private')));
    await assertSucceeds(getDocs(collection(db(uid), `${root}/conversations/private/messages`)));
  }
  for (const uid of ['outsider', null]) {
    await assertFails(getDoc(ref(uid, 'conversations/private')));
    await assertFails(getDoc(ref(uid, 'conversations/private/messages/original')));
    await assertFails(getDocs(collection(db(uid), `${root}/conversations/private/messages`)));
  }
  await assertFails(getDoc(ref('alice', 'conversations/malformed')));
});

test('conversation creation requires membership; existing membership cannot be replaced', async () => {
  await assertSucceeds(setDoc(ref('alice', 'conversations/new'), conversation));
  await assertFails(setDoc(ref('outsider', 'conversations/forged'), conversation));
  await assertFails(setDoc(ref('alice', 'conversations/duplicate'), { participants: [{ id: 'alice' }, { id: 'alice' }] }));
  await assertFails(updateDoc(ref('bob', 'conversations/private'), { participants: [{ id: 'bob' }, { id: 'outsider' }] }));
  await assertFails(updateDoc(ref('outsider', 'conversations/private'), { lastMessageText: 'tampered' }));
  await assertSucceeds(updateDoc(ref('bob', 'conversations/private'), { lastMessageText: 'Reply' }));
});

test('messages bind sender identity and prevent edits to someone else’s text', async () => {
  await assertSucceeds(setDoc(ref('bob', 'conversations/private/messages/reply'), { senderId: 'bob', text: 'Reply' }));
  await assertFails(setDoc(ref('bob', 'conversations/private/messages/spoof'), { senderId: 'alice', text: 'Forged' }));
  await assertFails(setDoc(ref('outsider', 'conversations/private/messages/intruder'), { senderId: 'outsider', text: 'Hello' }));
  await assertFails(updateDoc(ref('bob', 'conversations/private/messages/original'), { text: 'Replaced' }));
  await assertFails(updateDoc(ref('alice', 'conversations/private/messages/original'), { senderId: 'bob' }));
  await assertSucceeds(updateDoc(ref('alice', 'conversations/private/messages/original'), { text: 'Edited' }));
  await assertSucceeds(updateDoc(ref('bob', 'conversations/private/messages/original'), { isRead: true }));
  await assertFails(deleteDoc(ref('bob', 'conversations/private/messages/original')));
  await assertSucceeds(deleteDoc(ref('admin', 'conversations/private/messages/reply')));
});

test('users can create only their own safe signup profiles', async () => {
  const signup = { fullName: 'New User', email: 'new@example.test', totalEarnings: 0, availableBalance: 0,
    referralCount: 0, notificationCount: 0, isSeller: false, isBuyer: true, createdAt: new Date(), signupLocation: null, lastLoginLocation: null };
  await assertSucceeds(setDoc(ref('new', 'users/new'), signup));
  await assertSucceeds(setDoc(ref('fallback', 'users/fallback'), { displayName: 'Fallback', email: '', photoURL: '', createdAt: new Date(), isSeller: false, isBuyer: true }));
  await assertFails(setDoc(ref('alice', 'users/another'), signup));
  for (const extra of [{ availableBalance: 1000 }, { status: 'active' }, { role: 'admin' }, { isSeller: true }, { is2faEnabled: true }]) {
    await assertFails(setDoc(ref('bad', 'users/bad'), { ...signup, ...extra }));
  }
});

test('profile edits cannot change or remove protected fields', async () => {
  await assertSucceeds(updateDoc(ref('alice', 'users/alice'), { fullName: 'Edited', phone: '123', lastLoginLocation: null, savedGigs: ['gig'] }));
  for (const update of [{ availableBalance: 1000 }, { availableBalance: deleteField() }, { totalEarnings: 100 },
    { status: 'active' }, { role: 'admin' }, { isSeller: true }, { is2faEnabled: true }, { unknownPrivilege: true }]) {
    await assertFails(updateDoc(ref('alice', 'users/alice'), update));
  }
  await assertFails(updateDoc(ref('outsider', 'users/alice'), { fullName: 'Impersonator' }));
  await assertSucceeds(updateDoc(ref('admin', 'users/alice'), { status: 'active' }));
});
