const {test} = require('node:test');
const assert = require('node:assert/strict');
const memory = require('./helpers/memory-admin.cjs');
const {createBankPayouts} = require('../functions/bankPayouts');
const root = 'artifacts/default-digitask-app';
function fixture() {
  const f = memory({
    [root+'/users/admin']:{}, [root+'/admins/admin']:{}, [root+'/users/seller']:{},
    [root+'/bankOrders/order']:{status:'paid', settlementStatus:'held', sellerId:'seller', accountingVersion:1, sellerCreditMinor:100000},
    [root+'/bankLedger/order']:{sellerId:'seller', sellerMinor:100000},
    [root+'/sellerBalances/seller']:{heldMinor:100000, lifetimeCreditedMinor:100000, creditedOrders:1}
  });
  return {...f, manage:createBankPayouts(f.admin).manage};
}
const reserve = {action:'reserve', orderId:'order', expectedRevision:0, recipientVerified:true,
  bankDetails:{name:'Test Bank', accountName:'Seller', accountNumber:'0123456789'}};
const confirm = {action:'confirm', orderId:'order', expectedRevision:1, confirmedSent:true, sentAmount:1000, bankReference:'TRANSFER-001'};
test('reserving and confirming move exact amounts once, preserving lifetime credits', async () => {
  const f = fixture();
  await f.manage('admin', reserve);
  await assert.rejects(f.manage('admin', reserve));
  assert.equal(f.records.get(root+'/sellerBalances/seller').heldMinor, 0);
  assert.equal(f.records.get(root+'/sellerBalances/seller').reservedMinor, 100000);
  await Promise.all([f.manage('admin', confirm), f.manage('admin', confirm)]);
  const b = f.records.get(root+'/sellerBalances/seller');
  assert.equal(b.reservedMinor, 0); assert.equal(b.paidMinor, 100000);
  assert.equal(b.lifetimeCreditedMinor, 100000);
  assert.equal(f.records.get(root+'/bankOrders/order').settlementStatus, 'paid');
});
test('cancellation returns unpaid funds and stale actions cannot change a new reservation', async () => {
  const f = fixture();
  await f.manage('admin', reserve);
  const cancel = {action:'cancel', orderId:'order', expectedRevision:1, confirmedNotSent:true, reason:'Wrong recipient'};
  await f.manage('admin', cancel); await f.manage('admin', cancel);
  assert.equal(f.records.get(root+'/sellerBalances/seller').heldMinor, 100000);
  await f.manage('admin', {...reserve, expectedRevision:1});
  await assert.rejects(f.manage('admin', cancel));
  await assert.rejects(f.manage('admin', confirm));
  assert.ok(f.records.has(root+'/auditLogs/payout_order_1_cancel'));
  assert.ok(f.records.has(root+'/auditLogs/payout_order_2_reserve'));
});
test('unprivileged users, disputed orders and insufficient balances cannot reserve', async () => {
  const f = fixture();
  await assert.rejects(f.manage('seller', reserve));
  f.records.get(root+'/bankOrders/order').disputeStatus = 'open';
  await assert.rejects(f.manage('admin', reserve));
  f.records.get(root+'/bankOrders/order').disputeStatus = 'resolved';
  f.records.get(root+'/sellerBalances/seller').heldMinor = 1;
  await assert.rejects(f.manage('admin', reserve));
  assert.ok(!f.records.has(root+'/bankPayouts/order'));
});
test('failed commits and incorrect transfer amounts cannot consume reserved funds', async () => {
  const f = fixture();
  await f.manage('admin', reserve);
  await assert.rejects(f.manage('admin', {...confirm, sentAmount:999}));
  await assert.rejects(f.manage('admin', {...confirm, confirmedSent:false}));
  f.behavior.commitError = true;
  await assert.rejects(f.manage('admin', confirm));
  assert.equal(f.records.get(root+'/sellerBalances/seller').reservedMinor, 100000);
  assert.equal(f.records.get(root+'/bankPayouts/order').status, 'reserved');
  assert.ok(![...f.records.keys()].some(key=>key.includes('/bankPayoutReceipts/')));
});
test('the same bank transfer cannot complete two payouts', async () => {
  const f = fixture();
  await f.manage('admin', reserve);
  await f.manage('admin', confirm);
  f.records.set(root+'/bankOrders/other', {...f.records.get(root+'/bankOrders/order'), settlementStatus:'held'});
  f.records.set(root+'/bankLedger/other', {sellerId:'seller', sellerMinor:100000});
  f.records.get(root+'/sellerBalances/seller').heldMinor = 100000;
  await f.manage('admin', {...reserve, orderId:'other'});
  await assert.rejects(f.manage('admin', {...confirm, orderId:'other'}));
  assert.equal(f.records.get(root+'/bankPayouts/other').status, 'reserved');
});
