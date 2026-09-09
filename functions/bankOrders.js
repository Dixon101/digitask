'use strict';
const { createHash } = require('node:crypto');
const ROOT = 'artifacts/default-digitask-app';
function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw Error('Invalid identifier');
  return value;
}
function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000) throw Error('Invalid amount');
  return Math.round((value + Number.EPSILON) * 100);
}
exports.createBankOrders = admin => {
  const db = admin.firestore();
  const ref = path => db.doc(ROOT + '/' + path);
  const now = () => admin.firestore.FieldValue.serverTimestamp();
  async function account(tx, uid) {
    const lock = await tx.get(ref('accountLocks/' + id(uid)));
    if (lock.exists) throw Error('Account unavailable');
    const user = await tx.get(ref('users/' + uid));
    if (!user.exists || ['suspended', 'banned', 'deleted'].includes(user.data().status)) throw Error('Account unavailable');
  }
  async function create(uid, input) {
    const productId = id(input.productId);
    const orderId = id(uid) + '_' + id(input.requestId);
    return db.runTransaction(async tx => {
      await account(tx, uid);
      const orderRef = ref('bankOrders/' + orderId);
      const prior = await tx.get(orderRef);
      if (prior.exists) {
        if (prior.data().productId !== productId) throw Error('Request already used');
        return { orderId, total: prior.data().total };
      }
      const productSnap = await tx.get(ref('products/' + productId));
      const configSnap = await tx.get(ref('public/platformSettings'));
      if (!productSnap.exists || !configSnap.exists) throw Error('Product or payment settings unavailable');
      const product = productSnap.data(), config = configSnap.data();
      const sellerId = id(product.ownerId || product.vendor?.id);
      if (sellerId === uid || product.status !== 'published') throw Error('Product unavailable');
      await account(tx, sellerId);
      const prefix = ROOT + '/product_files/' + sellerId + '/';
      if (!Array.isArray(product.filePaths) || product.filePaths.length < 1 || product.filePaths.length > 50 ||
          product.filePaths.some(path => typeof path !== 'string' || !path.startsWith(prefix) ||
            !path.slice(prefix.length) || path.slice(prefix.length).includes('/'))) throw Error('Product files require review');
      const price = money(product.price);
      if (!price || typeof config.platformFeeRate !== 'number' || config.platformFeeRate < 0 || config.platformFeeRate > 1) throw Error('Invalid pricing');
      const fee = money(product.price * config.platformFeeRate);
      const processing = config.processingFeeAmount != null ? money(config.processingFeeAmount) :
        money(product.price * config.processingFeeRate);
      const total = (price + fee + processing) / 100;
      if (money(input.expectedTotal) !== money(total)) throw Error('Price changed. Reload checkout before paying.');
      const bank = config.bankDetails;
      if (!bank?.name || !bank.accountName || !/^\d{10}$/.test(bank.accountNumber)) throw Error('Bank details unavailable');
      tx.set(orderRef, { userId: uid, sellerId, productId, title: String(product.title || ''),
        filePaths: product.filePaths, price: price / 100, platformFee: fee / 100,
        processingFee: processing / 100, total, bankDetails: bank, status: 'pending',
        createdAt: now() });
      return { orderId, total };
    });
  }
  async function approve(uid, input) {
    const orderId = id(input.orderId);
    if (input.confirmedInBank !== true || typeof input.bankReference !== 'string' ||
        input.bankReference.trim().length < 4 || input.bankReference.length > 200) throw Error('Confirm receipt in the bank and provide its unique reference');
    const reference = input.bankReference.trim();
    const receiptId = createHash('sha256').update(reference.toUpperCase()).digest('hex');
    return db.runTransaction(async tx => {
      await account(tx, uid);
      if (!(await tx.get(ref('admins/' + uid))).exists) throw Error('Administrator required');
      const orderRef = ref('bankOrders/' + orderId);
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw Error('Order unavailable');
      const order = snap.data();
      if (order.status === 'paid') return { orderId, status: 'paid' };
      if (order.status !== 'pending' || money(input.receivedAmount) !== money(order.total)) throw Error('Order status or received amount does not match');
      await account(tx, order.userId);
      const receiptRef = ref('bankReceipts/' + receiptId);
      if ((await tx.get(receiptRef)).exists) throw Error('Bank reference already used');
      tx.set(receiptRef, { orderId, recordedBy: uid, createdAt: now() });
      tx.update(orderRef, { status: 'paid', reviewedBy: uid, paidAt: now(), receiptId });
      tx.set(ref('users/' + order.userId + '/bankPurchases/' + orderId), {
        orderId, productId: order.productId, title: order.title, filePaths: order.filePaths, createdAt: now()
      });
      tx.set(ref('auditLogs/bank_' + orderId), { action: 'bank_payment_confirmed', adminId: uid,
        orderId, amount: order.total, timestamp: now() });
      return { orderId, status: 'paid' };
    });
  }
  async function download(uid, input) {
    const orderId = id(input.orderId);
    const path = await db.runTransaction(async tx => {
      await account(tx, uid);
      const snap = await tx.get(ref('bankOrders/' + orderId));
      if (!snap.exists || snap.data().userId !== uid || snap.data().status !== 'paid') throw Error('Paid purchase required');
      const files = snap.data().filePaths;
      if (!Number.isInteger(input.fileIndex) || input.fileIndex < 0 || input.fileIndex >= files.length) throw Error('Invalid file');
      return files[input.fileIndex];
    });
    const [url] = await admin.storage().bucket().file(path).getSignedUrl({
      action: 'read', expires: Date.now() + 60000, responseDisposition: 'attachment'
    });
    return { url, expiresInSeconds: 60 };
  }
  return { create, approve, download };
};
