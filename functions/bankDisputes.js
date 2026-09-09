'use strict';
const {createHash} = require('node:crypto');
const ROOT = 'artifacts/default-digitask-app';
exports.createBankDisputes = admin => {
  const db = admin.firestore(), ref = path => db.doc(ROOT + '/' + path);
  const stamp = () => admin.firestore.FieldValue.serverTimestamp();
  const safe = value => {
    if (!Number.isSafeInteger(value) || value < 0) throw Error('Accounting requires review');
    return value;
  };
  async function manage(uid, input) {
    if (typeof input.orderId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(input.orderId) ||
        !['open', 'release', 'refund'].includes(input.action) || typeof input.reason !== 'string' ||
        input.reason.trim().length < 4 || input.reason.length > 1000) throw Error('Valid order, action and reason required');
    const orderId = input.orderId;
    return db.runTransaction(async tx => {
      const user = await tx.get(ref('users/' + uid));
      const lock = await tx.get(ref('accountLocks/' + uid));
      if (lock.exists || !user.exists || ['suspended','banned','deleted'].includes(user.data().status) ||
          !(await tx.get(ref('admins/' + uid))).exists) throw Error('Administrator required');
      const orderRef = ref('bankOrders/' + orderId);
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw Error('Order unavailable');
      const order = snap.data();
      if (input.action === 'refund' && order.status === 'refunded') return {status:'refunded'};
      const revision = safe(order.disputeRevision ?? 0);
      if (input.expectedRevision !== revision || !Number.isSafeInteger(revision + 1)) throw Error('Order changed. Reload.');
      if (order.status !== 'paid' || order.accountingVersion !== 1) throw Error('Only accounted paid orders are supported');
      let next = input.action === 'open' ? 'open' : 'resolved';
      if (input.action === 'open') {
        if (order.disputeStatus === 'open') throw Error('Dispute is already open');
      } else if (order.disputeStatus !== 'open') throw Error('Open a dispute hold first');
      if (input.action === 'refund') {
        // Never reclaim earnings from a reserved or completed seller transfer.
        if (order.settlementStatus !== 'held') throw Error('Cancel an unpaid payout reservation first; completed payouts require separate recovery');
        const ledger = await tx.get(ref('bankLedger/' + orderId));
        const refundRef = ref('bankRefunds/' + orderId);
        if (!ledger.exists || (await tx.get(refundRef)).exists) throw Error('Refund accounting requires review');
        const data = ledger.data();
        const sellerMinor = safe(data.sellerMinor), commissionMinor = safe(data.commissionMinor),
          processingMinor = safe(data.processingMinor), totalMinor = safe(data.receivedMinor);
        if (!sellerMinor || sellerMinor + commissionMinor + processingMinor !== totalMinor ||
            order.sellerCreditMinor !== sellerMinor || order.sellerId !== data.sellerId ||
            Math.round(order.total * 100) !== totalMinor) throw Error('Accounting mismatch');
        if (input.confirmedReturned !== true || typeof input.returnedAmount !== 'number' ||
            !Number.isFinite(input.returnedAmount) || Math.round(input.returnedAmount * 100) !== totalMinor ||
            typeof input.bankReference !== 'string' || input.bankReference.trim().length < 4 ||
            input.bankReference.length > 200) throw Error('Confirm the full returned amount and transfer reference');
        const receiptId = createHash('sha256').update(input.bankReference.trim().toUpperCase()).digest('hex');
        // Shared namespace prevents one outgoing transfer being claimed for a payout and refund.
        const receiptRef = ref('bankPayoutReceipts/' + receiptId);
        if ((await tx.get(receiptRef)).exists) throw Error('Transfer reference already used');
        const balanceRef = ref('sellerBalances/' + order.sellerId);
        const balanceSnap = await tx.get(balanceRef);
        if (!balanceSnap.exists) throw Error('Seller balance unavailable');
        const balance = balanceSnap.data(), held = safe(balance.heldMinor);
        if (held < sellerMinor) throw Error('Insufficient held funds');
        const refundedMinor = safe(safe(balance.refundedMinor ?? 0) + sellerMinor);
        tx.set(refundRef, {orderId, sellerId:order.sellerId, userId:order.userId, currency:'NGN',
          sellerMinor, commissionMinor, processingMinor, totalMinor, receiptId,
          reason:input.reason.trim(), refundedBy:uid, createdAt:stamp()});
        tx.set(receiptRef, {orderId, kind:'refund', recordedBy:uid, createdAt:stamp()});
        tx.update(balanceRef, {heldMinor:held - sellerMinor, refundedMinor, updatedAt:stamp()});
        tx.update(orderRef, {status:'refunded', settlementStatus:'refunded', refundedAt:stamp()});
        tx.update(ref('users/' + order.userId + '/bankPurchases/' + orderId), {status:'refunded'});
        next = 'refunded';
      }
      tx.update(orderRef, {disputeStatus:next, disputeRevision:revision + 1});
      tx.set(ref('bankDisputes/' + orderId), {orderId, userId:order.userId, sellerId:order.sellerId,
        status:next, revision:revision + 1, reason:input.reason.trim(), reviewedBy:uid, updatedAt:stamp()});
      tx.set(ref('auditLogs/dispute_' + orderId + '_' + (revision + 1)), {
        action:'bank_dispute_' + input.action, orderId, reason:input.reason.trim(), adminId:uid, timestamp:stamp()
      });
      return {status:next};
    });
  }
  async function report(uid, input) {
    if (typeof input.orderId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(input.orderId) ||
        typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000)
      throw Error('Select a purchase and describe the problem in 10–1000 characters');
    const orderId = input.orderId;
    return db.runTransaction(async tx => {
      const user = await tx.get(ref('users/' + uid));
      const lock = await tx.get(ref('accountLocks/' + uid));
      if (!user.exists || lock.exists || ['suspended','banned','deleted'].includes(user.data().status)) throw Error('Account unavailable');
      const orderRef = ref('bankOrders/' + orderId), reportRef = ref('bankDisputeReports/' + orderId);
      const snap = await tx.get(orderRef);
      if (!snap.exists || snap.data().userId !== uid) throw Error('Purchase ownership required');
      const prior = await tx.get(reportRef);
      if (prior.exists) return {status:'reported'};
      const order = snap.data();
      if (order.status !== 'paid' || order.accountingVersion !== 1) throw Error('Paid purchase required');
      const revision = safe(order.disputeRevision ?? 0);
      // Preserve an existing admin hold; a report cannot overwrite the decision/reason.
      const opening = order.disputeStatus !== 'open';
      if (opening && revision !== 0) throw Error('This case has already been reviewed. Contact support.');
      tx.set(reportRef, {orderId,userId:uid,sellerId:order.sellerId,reason:input.reason.trim(),createdAt:stamp()});
      if (opening) {
        tx.update(orderRef, {disputeStatus:'open',disputeRevision:1});
        tx.set(ref('bankDisputes/' + orderId), {orderId,userId:uid,sellerId:order.sellerId,
          status:'open',revision:1,reason:input.reason.trim(),reportedBy:uid,updatedAt:stamp()});
      }
      tx.set(ref('auditLogs/customer_dispute_' + orderId), {action:'customer_bank_dispute',
        orderId,userId:uid,timestamp:stamp()});
      return {status:'reported'};
    });
  }
  return {manage, report};
};
