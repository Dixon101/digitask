'use strict';
const { createHash } = require('node:crypto');
const ROOT = 'artifacts/default-digitask-app';
const identifier = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw Error('Invalid order ID');
  return value;
};
const minor = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('Balance requires reconciliation');
  return value;
};
exports.createBankPayouts = admin => {
  const db = admin.firestore();
  const ref = path => db.doc(ROOT + '/' + path);
  const timestamp = () => admin.firestore.FieldValue.serverTimestamp();
  async function manage(uid, input) {
    const orderId = identifier(input.orderId);
    if (!['reserve', 'cancel', 'confirm'].includes(input.action)) throw Error('Invalid action');
    return db.runTransaction(async tx => {
      const adminUser = await tx.get(ref('users/' + identifier(uid)));
      const adminLock = await tx.get(ref('accountLocks/' + uid));
      if (adminLock.exists || !adminUser.exists || ['suspended', 'banned', 'deleted'].includes(adminUser.data().status) ||
          !(await tx.get(ref('admins/' + uid))).exists) throw Error('Administrator required');
      const orderRef = ref('bankOrders/' + orderId);
      const orderSnap = await tx.get(orderRef);
      const ledgerSnap = await tx.get(ref('bankLedger/' + orderId));
      if (!orderSnap.exists || !ledgerSnap.exists) throw Error('Accounting entry required');
      const order = orderSnap.data(), ledger = ledgerSnap.data();
      const sellerId = identifier(order.sellerId);
      const amount = minor(ledger.sellerMinor);
      if (!amount || ledger.sellerId !== sellerId || order.accountingVersion !== 1 ||
          order.sellerCreditMinor !== amount) throw Error('Accounting mismatch');
      const payoutRef = ref('bankPayouts/' + orderId);
      const payoutSnap = await tx.get(payoutRef);
      const payout = payoutSnap.exists ? payoutSnap.data() : null;
      const revision = payout?.revision ?? 0;
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== revision)
        throw Error('Payout changed. Reload before continuing.');
      const balanceRef = ref('sellerBalances/' + sellerId);
      const balanceSnap = await tx.get(balanceRef);
      if (!balanceSnap.exists) throw Error('Balance unavailable');
      const balance = balanceSnap.data();
      let held = minor(balance.heldMinor), reserved = minor(balance.reservedMinor ?? 0), paid = minor(balance.paidMinor ?? 0);
      if (input.action === 'reserve') {
        if (payout?.status === 'reserved' && order.settlementStatus === 'reserved') return {status:'reserved'};
        if (payout && payout.status !== 'cancelled' || order.status !== 'paid' || order.settlementStatus !== 'held' ||
            order.disputeStatus && order.disputeStatus !== 'resolved') throw Error('Order cannot be reserved');
        const seller = await tx.get(ref('users/' + sellerId));
        const lock = await tx.get(ref('accountLocks/' + sellerId));
        if (lock.exists || !seller.exists || ['suspended', 'banned', 'deleted'].includes(seller.data().status)) throw Error('Seller unavailable');
        const bank = input.bankDetails;
        if (input.recipientVerified !== true || !bank || typeof bank.name !== 'string' ||
            typeof bank.accountName !== 'string' || !bank.name.trim() || !bank.accountName.trim() ||
            bank.name.length > 150 || bank.accountName.length > 150 || typeof bank.accountNumber !== 'string' || !/^\d{10}$/.test(bank.accountNumber)) throw Error('Verified recipient details required');
        if (held < amount) throw Error('Insufficient held balance');
        held -= amount; reserved = minor(reserved + amount);
        tx.set(payoutRef, {orderId, sellerId, amountMinor:amount, currency:'NGN', status:'reserved', revision:revision + 1,
          bankDetails:{name:bank.name.trim(), accountName:bank.accountName.trim(), accountNumber:bank.accountNumber},
          reservedBy:uid, createdAt:timestamp()});
      } else {
        if (input.action === 'confirm' && payout?.status === 'paid' && order.settlementStatus === 'paid') return {status:'paid'};
        if (input.action === 'cancel' && payout?.status === 'cancelled') return {status:'cancelled'};
        if (!payout || payout.status !== 'reserved' || order.settlementStatus !== 'reserved' ||
            payout.amountMinor !== amount || payout.sellerId !== sellerId || reserved < amount) throw Error('Reservation mismatch');
        reserved -= amount;
        if (input.action === 'cancel') {
          if (input.confirmedNotSent !== true || typeof input.reason !== 'string' || input.reason.trim().length < 4 || input.reason.length > 500) throw Error('Confirm transfer was not sent and provide a reason');
          held = minor(held + amount);
          tx.update(payoutRef, {status:'cancelled', cancelledBy:uid, reason:input.reason.trim(), cancelledAt:timestamp()});
        } else {
          if (order.status !== 'paid' || order.disputeStatus && order.disputeStatus !== 'resolved') throw Error('Order requires review');
          if (input.confirmedSent !== true || typeof input.bankReference !== 'string' ||
              input.bankReference.trim().length < 4 || input.bankReference.length > 200 ||
              typeof input.sentAmount !== 'number' || !Number.isFinite(input.sentAmount) ||
              Math.round(input.sentAmount * 100) !== amount) throw Error('Transfer amount and reference required');
          const reference = input.bankReference.trim().toUpperCase();
          const receiptId = createHash('sha256').update(reference).digest('hex');
          const receiptRef = ref('bankPayoutReceipts/' + receiptId);
          if ((await tx.get(receiptRef)).exists) throw Error('Transfer reference already used');
          paid = minor(paid + amount);
          tx.set(receiptRef, {orderId, recordedBy:uid, createdAt:timestamp()});
          tx.update(payoutRef, {status:'paid', receiptId, paidBy:uid, paidAt:timestamp()});
        }
      }
      const status = input.action === 'reserve' ? 'reserved' : input.action === 'confirm' ? 'paid' : 'cancelled';
      tx.update(orderRef, {settlementStatus:status === 'cancelled' ? 'held' : status});
      tx.update(balanceRef, {heldMinor:held, reservedMinor:reserved, paidMinor:paid, updatedAt:timestamp()});
      tx.set(ref('auditLogs/payout_' + orderId + '_' + (input.action === 'reserve' ? revision + 1 : revision) + '_' + input.action), {
        action:'bank_payout_' + input.action, orderId, sellerId, amountMinor:amount, adminId:uid, timestamp:timestamp()
      });
      return {status};
    });
  }
  return {manage};
};
