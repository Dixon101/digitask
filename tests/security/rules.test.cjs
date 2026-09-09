const { test, before, after } = require('node:test');
const { readFileSync } = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, writeBatch, serverTimestamp } = require('firebase/firestore');
const { ref: storageRef, uploadBytes, getMetadata, deleteObject } = require('firebase/storage');
let env;
const root = 'artifacts/default-digitask-app';
const conversation = { participants: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }] };
const db = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
const ref = (uid, path) => doc(db(uid), `${root}/${path}`);
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-digitask-security', firestore: {
    host: '127.0.0.1', port: 8088, rules: readFileSync('../../firestore.rules', 'utf8')
  }, storage: { host: '127.0.0.1', port: 9199, rules: readFileSync('../../storage.rules', 'utf8') } });
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

test('deletion requests require recent owner authentication and administrator review', async () => {
  const fresh = env.authenticatedContext('recent', { auth_time: Math.floor(Date.now()/1000) }).firestore();
  const stale = env.authenticatedContext('stale', { auth_time: Math.floor(Date.now()/1000)-600 }).firestore();
  await assertFails(setDoc(doc(stale, `${root}/deletionRequests/stale`), { status: 'requested', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(fresh, `${root}/deletionRequests/another`), { status: 'requested', createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(fresh, `${root}/deletionRequests/recent`), { status: 'requested', createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(fresh, `${root}/deletionRequests/recent`), { status: 'approved' }));
  await assertSucceeds(updateDoc(ref('admin', 'deletionRequests/recent'), { status: 'approved', reviewedBy: 'admin', reviewedAt: serverTimestamp() }));
});

test('locked accounts cannot access private data, create profiles or queue activation', async () => {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), `${root}/accountLocks/closed`), {});
    await setDoc(doc(c.firestore(), `${root}/users/closed`), { status: 'deleted' });
  });
  await assertFails(getDoc(ref('closed', 'users/closed')));
  await assertFails(setDoc(ref('closed', 'users/closed'), { fullName: 'Recreated' }));
  await assertFails(setDoc(doc(db('admin'), 'auth_updates/closed'), { userId: 'closed', status: 'active', processed: false, timestamp: '' }));
  await assertFails(setDoc(ref('alice', 'fileGrants/file/users/alice'), { ownerId: 'bob', active: true }));
  await assertFails(setDoc(ref('alice', 'users/alice/myPurchases/forged'), { paid: true }));
});

const storage = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage('demo-digitask-security.appspot.com');
test('payout recipient records are private and payout writes require server code', async () => {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), root+'/bankPayouts/payout'), {sellerId:'alice', status:'reserved'});
    await setDoc(doc(c.firestore(), root+'/bankPayoutReceipts/receipt'), {orderId:'payout'});
  });
  for (const uid of ['alice','admin']) await assertSucceeds(getDoc(ref(uid,'bankPayouts/payout')));
  for (const uid of ['bob',null]) await assertFails(getDoc(ref(uid,'bankPayouts/payout')));
  await assertSucceeds(getDoc(ref('admin','bankPayoutReceipts/receipt')));
  await assertFails(getDoc(ref('alice','bankPayoutReceipts/receipt')));
  for (const uid of ['alice','admin']) {
    await assertFails(updateDoc(ref(uid,'bankPayouts/payout'), {status:'paid'}));
    await assertFails(setDoc(ref(uid,'bankPayoutReceipts/forged'), {orderId:'payout'}));
    await assertFails(deleteDoc(ref(uid,'bankPayouts/payout')));
  }
});
test('seller balances and accounting entries are readable only by seller or admin and never client writable', async () => {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), root+'/sellerBalances/alice'), { heldMinor: 10000 });
    await setDoc(doc(c.firestore(), root+'/bankLedger/entry'), { sellerId: 'alice', sellerMinor: 10000 });
  });
  for (const path of ['sellerBalances/alice', 'bankLedger/entry']) {
    for (const uid of ['alice', 'admin']) {
      await assertSucceeds(getDoc(ref(uid, path)));
      await assertFails(updateDoc(ref(uid, path), { heldMinor: 99999 }));
      await assertFails(deleteDoc(ref(uid, path)));
    }
    for (const uid of ['bob', null]) await assertFails(getDoc(ref(uid, path)));
  }
  await assertFails(setDoc(ref('alice', 'sellerBalances/forged'), {heldMinor: 1}));
  await assertFails(setDoc(ref('admin', 'bankLedger/forged'), {sellerId: 'alice'}));
});
test('bank orders, receipts and delivery entitlements can only be written by the server', async () => {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), root + '/bankOrders/server-order'), { userId: 'alice', status: 'paid' });
    await setDoc(doc(c.firestore(), root + '/users/alice/bankPurchases/server-order'), { title: 'Book' });
  });
  await assertSucceeds(getDoc(ref('alice', 'bankOrders/server-order')));
  await assertFails(getDoc(ref('bob', 'bankOrders/server-order')));
  await assertSucceeds(getDoc(ref('alice', 'users/alice/bankPurchases/server-order')));
  await assertFails(getDoc(ref('bob', 'users/alice/bankPurchases/server-order')));
  for (const uid of ['alice', 'admin']) {
    await assertFails(setDoc(ref(uid, 'bankOrders/forged'), { userId: uid, status: 'paid' }));
    await assertFails(updateDoc(ref(uid, 'bankOrders/server-order'), { status: 'paid' }));
    await assertFails(setDoc(ref(uid, 'bankReceipts/forged'), { orderId: 'forged' }));
    await assertFails(setDoc(ref(uid, 'users/alice/bankPurchases/forged'), { title: 'Free' }));
  }
});
test('product publishing binds ownership and protects counters, files and moderation', async () => {
  const product = { ownerId: 'alice', sellerId: 'alice', vendor: { id: 'alice' }, title: 'Book',
    description: 'Description', price: 100, license: 'personal', filePaths: ['product_files/alice/book.pdf'],
    previewUrls: [], status: 'published', sales: 0, rating: 0, isFeatured: false, createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(ref('alice', 'products/owned'), product));
  for (const extra of [{ ownerId: 'bob' }, { sellerId: 'bob' }, { vendor: { id: 'bob' } },
    { sales: 1 }, { rating: 5 }, { isFeatured: true }, { price: -1 }, { fileUrls: ['https://example.test'] }]) {
    await assertFails(setDoc(ref('alice', 'products/forged'), { ...product, ...extra }));
  }
  await assertFails(updateDoc(ref('bob', 'products/owned'), { title: 'Stolen' }));
  await assertSucceeds(updateDoc(ref('alice', 'products/owned'), { title: 'Edited', price: 200 }));
  for (const extra of [{ ownerId: 'bob' }, { sales: 5 }, { filePaths: ['replaced'] }, { isFeatured: true }]) {
    await assertFails(updateDoc(ref('alice', 'products/owned'), extra));
  }
  await assertSucceeds(updateDoc(ref('admin', 'products/owned'), { status: 'rejected' }));
  await assertFails(updateDoc(ref('alice', 'products/owned'), { status: 'published' }));
  await assertSucceeds(updateDoc(ref('admin', 'products/owned'), { status: 'published' }));
  await assertSucceeds(updateDoc(ref('alice', 'products/owned'), { status: 'archived' }));
  await assertFails(deleteDoc(ref('alice', 'products/owned')));
  await assertFails(updateDoc(ref('alice', 'products/owned'), { status: 'published' }));
});

test('gig publishing binds all ownership fields and rejects fabricated reputation', async () => {
  const gig = { ownerId: 'bob', userId: 'bob', clientId: 'bob', title: 'Design',
    description: 'Design a logo', price: 100, delivery: 2, status: 'published',
    rating: 0, reviews: 0, isFeatured: false, createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(ref('bob', 'gigs/owned'), gig));
  for (const extra of [{ clientId: 'alice' }, { userId: 'alice' }, { reviews: 4 }, { delivery: 1.5 }, { price: 0 }]) {
    await assertFails(setDoc(ref('bob', 'gigs/forged'), { ...gig, ...extra }));
  }
  await assertFails(updateDoc(ref('alice', 'gigs/owned'), { title: 'Stolen' }));
  await assertSucceeds(updateDoc(ref('bob', 'gigs/owned'), { title: 'Updated' }));
  await assertFails(updateDoc(ref('bob', 'gigs/owned'), { rating: 5 }));
});

test('private product files require owner, administrator or trusted file grant', async () => {
  const path = `${root}/product_files/alice/book.pdf`;
  await assertSucceeds(uploadBytes(storageRef(storage('alice'), path), new Uint8Array([1,2]), { contentType: 'application/pdf' }));
  await assertSucceeds(getMetadata(storageRef(storage('alice'), path)));
  await assertFails(getMetadata(storageRef(storage('outsider'), path)));
  await assertFails(getMetadata(storageRef(storage(null), path)));
  await assertFails(uploadBytes(storageRef(storage('bob'), path), new Uint8Array([3])));
  await assertFails(deleteObject(storageRef(storage('alice'), path)));
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), `${root}/fileGrants/book.pdf/users/bob`), { ownerId: 'alice', active: true });
  });
  await assertSucceeds(getMetadata(storageRef(storage('bob'), path)));
  await assertSucceeds(getMetadata(storageRef(storage('admin'), path)));
});
test('chat files bind upload ownership and restrict reads to participants', async () => {
  const path = `${root}/chat_attachments/private/image.png`;
  await assertFails(uploadBytes(storageRef(storage('outsider'), path), new Uint8Array([1]), { customMetadata: { ownerId: 'outsider' } }));
  await assertFails(uploadBytes(storageRef(storage('alice'), path), new Uint8Array([1]), { customMetadata: { ownerId: 'bob' } }));
  await assertSucceeds(uploadBytes(storageRef(storage('alice'), path), new Uint8Array([1]), { customMetadata: { ownerId: 'alice' } }));
  await assertSucceeds(getMetadata(storageRef(storage('bob'), path)));
  await assertFails(getMetadata(storageRef(storage('outsider'), path)));
  await assertFails(deleteObject(storageRef(storage('bob'), path)));
});
test('public previews reject executable uploads and payment proofs are private', async () => {
  await assertFails(uploadBytes(storageRef(storage('alice'), `${root}/product_previews/alice/page.html`), new Uint8Array([1]), { contentType: 'text/html' }));
  const preview = `${root}/product_previews/alice/picture.png`;
  await assertSucceeds(uploadBytes(storageRef(storage('alice'), preview), new Uint8Array([1]), { contentType: 'image/png' }));
  await assertSucceeds(getMetadata(storageRef(storage(null), preview)));
  const proof = 'payment_proofs/alice/proof.png';
  await assertSucceeds(uploadBytes(storageRef(storage('alice'), proof), new Uint8Array([1])));
  await assertFails(getMetadata(storageRef(storage('bob'), proof)));
  await assertSucceeds(getMetadata(storageRef(storage('admin'), proof)));
});

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
