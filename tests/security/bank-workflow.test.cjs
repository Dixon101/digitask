'use strict';
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {createBankOrders} = require('../../functions/bankOrders');
const {createBankPayouts} = require('../../functions/bankPayouts');
const {createBankDisputes} = require('../../functions/bankDisputes');
const root = 'artifacts/default-digitask-app';
let app, db, orders, payouts, disputes;
before(() => {
  // Never allow these Admin SDK tests to fall back to a real project.
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8088');
  app = admin.initializeApp({projectId:'demo-digitask-security'});
  db = admin.firestore();
  orders = createBankOrders(admin);
  payouts = createBankPayouts(admin);
  disputes = createBankDisputes(admin);
});
after(async () => { if (app) await app.delete(); });
const record = path => db.doc(`${root}/${path}`);
const data = async path => (await record(path).get()).data();
async function seed(tag) {
  const ids = {buyer:`${tag}buyer`, seller:`${tag}seller`, admin:`${tag}admin`, product:`${tag}book`};
  const batch = db.batch();
  for (const uid of [ids.buyer, ids.seller, ids.admin]) batch.set(record(`users/${uid}`), {});
  batch.set(record(`admins/${ids.admin}`), {});
  batch.set(record(`products/${ids.product}`), {ownerId:ids.seller, status:'published', title:'Synthetic book', price:1000,
    filePaths:[`${root}/product_files/${ids.seller}/synthetic-file`]});
  batch.set(record('public/platformSettings'), {platformFeeRate:0.1, processingFeeAmount:100,
    bankDetails:{name:'QA bank',accountName:'QA business',accountNumber:'0123456789'}});
  await batch.commit(); return ids;
}
async function paid(ids, requestId) {
  const result = await orders.create(ids.buyer, {productId:ids.product, requestId, expectedTotal:1200});
  const approval = {orderId:result.orderId,confirmedInBank:true,receivedAmount:1200,bankReference:`QA-${ids.buyer}-${requestId}`};
  await assert.rejects(orders.approve(ids.buyer, approval), /Administrator/);
  await Promise.all([orders.approve(ids.admin,approval),orders.approve(ids.admin,approval)]);
  return result.orderId;
}
const reserve = orderId => ({orderId,action:'reserve',expectedRevision:0,recipientVerified:true,
  bankDetails:{name:'QA bank',accountName:'QA seller',accountNumber:'0123456789'}});

test('real Firestore transactions: concurrent approvals, reservations and payout stay balanced', async () => {
  const ids=await seed('pay');
  const orderId=await paid(ids,'first');
  let balance=await data(`sellerBalances/${ids.seller}`);
  assert.equal(balance.heldMinor,100000); assert.equal(balance.creditedOrders,1);
  assert.ok((await record(`users/${ids.buyer}/bankPurchases/${orderId}`).get()).exists);
  await payouts.manage(ids.admin,reserve(orderId));
  await assert.rejects(payouts.manage(ids.admin,reserve(orderId)),/changed/);
  const confirmation={orderId,action:'confirm',expectedRevision:1,confirmedSent:true,sentAmount:1000,bankReference:'QA-PAYOUT-ONE'};
  await Promise.all([payouts.manage(ids.admin,confirmation),payouts.manage(ids.admin,confirmation)]);
  balance=await data(`sellerBalances/${ids.seller}`);
  assert.equal(balance.heldMinor,0); assert.equal(balance.reservedMinor,0); assert.equal(balance.paidMinor,100000);
  assert.equal((await data(`bankOrders/${orderId}`)).settlementStatus,'paid');
  const second=await paid(ids,'second');
  await payouts.manage(ids.admin,reserve(second));
  await assert.rejects(payouts.manage(ids.admin,{...confirmation,orderId:second}));
  assert.equal((await data(`bankOrders/${second}`)).settlementStatus,'reserved');
});

test('real Firestore transactions: customer dispute blocks payout and refund revokes purchase', async () => {
  const ids=await seed('refund'); const orderId=await paid(ids,'first');
  await disputes.report(ids.buyer,{orderId,reason:'Synthetic purchased file problem'});
  await assert.rejects(payouts.manage(ids.admin,reserve(orderId)));
  const revision=(await data(`bankDisputes/${orderId}`)).revision;
  const refund={orderId,action:'refund',expectedRevision:revision,reason:'Synthetic refund confirmed',confirmedReturned:true,
    returnedAmount:1200,bankReference:'QA-REFUND-ONE'};
  await Promise.all([disputes.manage(ids.admin,refund),disputes.manage(ids.admin,refund)]);
  assert.equal((await data(`bankOrders/${orderId}`)).status,'refunded');
  assert.equal((await data(`users/${ids.buyer}/bankPurchases/${orderId}`)).status,'refunded');
  const balance=await data(`sellerBalances/${ids.seller}`);
  assert.equal(balance.heldMinor,0); assert.equal(balance.refundedMinor,100000);
  // Must fail before any Storage signing call; no signed URLs are generated here.
  await assert.rejects(orders.download(ids.buyer,{orderId,fileIndex:0}));
});
