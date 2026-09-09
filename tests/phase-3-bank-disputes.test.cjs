const {test} = require('node:test');
const assert = require('node:assert/strict');
const memory = require('./helpers/memory-admin.cjs');
const {createBankDisputes} = require('../functions/bankDisputes');
const {createBankPayouts} = require('../functions/bankPayouts');
const {createBankOrders} = require('../functions/bankOrders');
const {createHash} = require('node:crypto');
const root = 'artifacts/default-digitask-app';
function fixture() {
  const f = memory({
    [root+'/users/admin']:{}, [root+'/admins/admin']:{}, [root+'/users/seller']:{}, [root+'/users/buyer']:{},
    [root+'/bankOrders/order']:{status:'paid', settlementStatus:'held', userId:'buyer', sellerId:'seller',
      accountingVersion:1, sellerCreditMinor:100000, total:1200, filePaths:['file']},
    [root+'/bankLedger/order']:{sellerId:'seller', sellerMinor:100000, commissionMinor:10000, processingMinor:10000, receivedMinor:120000},
    [root+'/sellerBalances/seller']:{heldMinor:100000, lifetimeCreditedMinor:100000, creditedOrders:1},
    [root+'/users/buyer/bankPurchases/order']:{title:'Book'}
  });
  return {...f, manage:createBankDisputes(f.admin).manage,
    payout:createBankPayouts(f.admin).manage, download:createBankOrders(f.admin).download};
}
const open = {orderId:'order', action:'open', reason:'Buyer reports missing content', expectedRevision:0};
const refund = {orderId:'order', action:'refund', reason:'Refund agreed and returned', expectedRevision:1,
  confirmedReturned:true, returnedAmount:1200, bankReference:'REFUND-001'};
const reserve = {orderId:'order', action:'reserve', expectedRevision:0, recipientVerified:true,
  bankDetails:{name:'Bank', accountName:'Seller', accountNumber:'0123456789'}};
test('dispute holds block payout reservation; resolving a hold preserves earnings', async () => {
  const f = fixture();
  await assert.rejects(f.manage('buyer',open));
  await f.manage('admin',open);
  await assert.rejects(f.payout('admin',reserve));
  await f.manage('admin',{...open, action:'release', expectedRevision:1});
  assert.equal(f.records.get(root+'/sellerBalances/seller').heldMinor,100000);
  await assert.rejects(f.manage('admin',refund));
  await f.payout('admin',reserve);
});
test('full refund reverses held earnings once and blocks new downloads', async () => {
  const f = fixture();
  await f.manage('admin',open);
  await Promise.all([f.manage('admin',refund),f.manage('admin',refund)]);
  const b=f.records.get(root+'/sellerBalances/seller');
  assert.equal(b.heldMinor,0); assert.equal(b.refundedMinor,100000);
  assert.equal(b.lifetimeCreditedMinor,100000);
  const r=f.records.get(root+'/bankRefunds/order');
  assert.equal(r.totalMinor,r.sellerMinor+r.commissionMinor+r.processingMinor);
  assert.equal(f.records.get(root+'/users/buyer/bankPurchases/order').status,'refunded');
  await assert.rejects(f.download('buyer',{orderId:'order',fileIndex:0}));
  await assert.rejects(f.payout('admin',reserve));
});
test('refund needs full confirmed transfer and an unused outgoing bank reference', async () => {
  const f=fixture();
  await f.manage('admin',open);
  await assert.rejects(f.manage('admin',{...refund,returnedAmount:1000}));
  await assert.rejects(f.manage('admin',{...refund,confirmedReturned:false}));
  const receipt=createHash('sha256').update('REFUND-001').digest('hex');
  f.records.set(root+'/bankPayoutReceipts/'+receipt,{orderId:'another'});
  await assert.rejects(f.manage('admin',refund));
  assert.equal(f.records.get(root+'/sellerBalances/seller').heldMinor,100000);
});
test('reserved or completed payouts cannot be refunded from held funds', async () => {
  for(const state of ['reserved','paid']) {
    const f=fixture();
    f.records.get(root+'/bankOrders/order').settlementStatus=state;
    await f.manage('admin',open);
    await assert.rejects(f.manage('admin',refund));
    assert.ok(!f.records.has(root+'/bankRefunds/order'));
  }
});
test('failed refund commit leaves balance, access and status unchanged', async () => {
  const f=fixture();
  await f.manage('admin',open);
  f.behavior.commitError=true;
  await assert.rejects(f.manage('admin',refund));
  assert.equal(f.records.get(root+'/bankOrders/order').status,'paid');
  assert.equal(f.records.get(root+'/sellerBalances/seller').heldMinor,100000);
  assert.ok(!f.records.has(root+'/bankRefunds/order'));
  assert.notEqual(f.records.get(root+'/users/buyer/bankPurchases/order').status,'refunded');
});
test('opening a dispute blocks confirmation of an already reserved payout', async () => {
  const f=fixture();
  await f.payout('admin',reserve);
  await f.manage('admin',open);
  await assert.rejects(f.payout('admin',{orderId:'order',action:'confirm',expectedRevision:1,
    confirmedSent:true,sentAmount:1000,bankReference:'TRANSFER-001'}));
  await f.payout('admin',{orderId:'order',action:'cancel',expectedRevision:1,confirmedNotSent:true,reason:'Disputed sale'});
  await f.manage('admin',refund);
  assert.equal(f.records.get(root+'/sellerBalances/seller').heldMinor,0);
});
