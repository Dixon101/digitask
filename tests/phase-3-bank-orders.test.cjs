const { test } = require('node:test');
const assert = require('node:assert/strict');
const memory = require('./helpers/memory-admin.cjs');
const { createBankOrders } = require('../functions/bankOrders');
const root = 'artifacts/default-digitask-app';
function fixture() {
  const f = memory({
    [root+'/users/buyer']: {}, [root+'/users/seller']: {}, [root+'/users/admin']: {}, [root+'/admins/admin']: {},
    [root+'/products/book']: { ownerId: 'seller', status: 'published', title: 'Book', price: 1000,
      filePaths: [root+'/product_files/seller/book.pdf'] },
    [root+'/public/platformSettings']: { platformFeeRate: 0.1, processingFeeAmount: 100,
      bankDetails: { name: 'Test', accountName: 'Test', accountNumber: '0123456789' } }
  });
  const signed = [];
  f.admin.storage = () => ({ bucket: () => ({ file: path => ({ getSignedUrl: async options => {
    signed.push({path, options}); return ['https://example.test/temporary'];
  } }) }) });
  return { ...f, signed, service: createBankOrders(f.admin) };
}
const input = { productId: 'book', requestId: 'request', expectedTotal: 1200 };
const approval = { orderId: 'buyer_request', confirmedInBank: true, receivedAmount: 1200, bankReference: 'BANK-0001' };
test('server quotes reject tampered totals and preserve idempotent order snapshots', async () => {
  const f = fixture();
  await assert.rejects(f.service.create('buyer', {...input, expectedTotal: 1}));
  await f.service.create('buyer', input);
  f.records.get(root+'/products/book').price = 2000;
  await f.service.create('buyer', input);
  assert.equal(f.records.get(root+'/bankOrders/buyer_request').total, 1200);
  assert.equal(f.records.get(root+'/bankOrders/buyer_request').status, 'pending');
});
test('approval requires administrator, exact credited amount and unused bank reference', async () => {
  const f = fixture();
  await f.service.create('buyer', input);
  await assert.rejects(f.service.approve('buyer', approval));
  await assert.rejects(f.service.approve('admin', {...approval, receivedAmount: 1}));
  await assert.rejects(f.service.approve('admin', {...approval, confirmedInBank: false}));
  await Promise.all([f.service.approve('admin', approval), f.service.approve('admin', approval)]);
  assert.ok(f.records.has(root+'/users/buyer/bankPurchases/buyer_request'));
  await f.service.create('buyer', {...input, requestId: 'second'});
  await assert.rejects(f.service.approve('admin', {...approval, orderId: 'buyer_second'}));
  assert.equal(f.records.get(root+'/bankOrders/buyer_second').status, 'pending');
});
test('failed approval writes no entitlement; downloads require paid owner and unlocked account', async () => {
  const f = fixture();
  await f.service.create('buyer', input);
  await assert.rejects(f.service.download('buyer', {orderId: approval.orderId, fileIndex: 0}));
  f.behavior.commitError = true;
  await assert.rejects(f.service.approve('admin', approval));
  assert.equal(f.records.get(root+'/bankOrders/buyer_request').status, 'pending');
  assert.ok(!f.records.has(root+'/users/buyer/bankPurchases/buyer_request'));
  assert.ok(!f.records.has(root+'/sellerBalances/seller'));
  assert.ok(!f.records.has(root+'/bankLedger/buyer_request'));
  f.behavior.commitError = false;
  await f.service.approve('admin', approval);
  await assert.rejects(f.service.download('seller', {orderId: approval.orderId, fileIndex: 0}));
  await f.service.download('buyer', {orderId: approval.orderId, fileIndex: 0});
  assert.equal(f.signed.length, 1);
  assert.ok(f.signed[0].options.expires <= Date.now()+60000);
  f.records.set(root+'/accountLocks/buyer', {});
  await assert.rejects(f.service.download('buyer', {orderId: approval.orderId, fileIndex: 0}));
});
test('unpublished listings and another seller’s private paths cannot enter an order', async () => {
  const f = fixture();
  const product = f.records.get(root+'/products/book');
  product.filePaths = [root+'/product_files/another/secret.pdf'];
  await assert.rejects(f.service.create('buyer', input));
  product.status = 'archived';
  await assert.rejects(f.service.create('buyer', input));
});
test('approval balances receipts against seller earnings and fees exactly once', async () => {
  const f = fixture();
  await f.service.create('buyer', input);
  // Later admin fee changes must not rewrite this order's agreed fees.
  f.records.get(root+'/public/platformSettings').platformFeeRate = 0.9;
  await Promise.all([f.service.approve('admin', approval), f.service.approve('admin', approval)]);
  const entry = f.records.get(root+'/bankLedger/buyer_request');
  assert.equal(entry.receivedMinor, 120000);
  assert.equal(entry.sellerMinor, 100000);
  assert.equal(entry.commissionMinor, 10000);
  assert.equal(entry.processingMinor, 10000);
  assert.equal(entry.receivedMinor, entry.sellerMinor + entry.commissionMinor + entry.processingMinor);
  assert.equal(f.records.get(root+'/sellerBalances/seller').heldMinor, 100000);
  assert.equal(f.records.get(root+'/sellerBalances/seller').creditedOrders, 1);
});
test('concurrent separate payments accumulate without losing seller credits', async () => {
  const f = fixture();
  await f.service.create('buyer', input);
  await f.service.create('buyer', {...input, requestId:'second'});
  await Promise.all([f.service.approve('admin', approval),
    f.service.approve('admin', {...approval, orderId:'buyer_second', bankReference:'BANK-0002'})]);
  const balance = f.records.get(root+'/sellerBalances/seller');
  assert.equal(balance.heldMinor, 200000);
  assert.equal(balance.lifetimeCreditedMinor, 200000);
  assert.equal(balance.creditedOrders, 2);
});
test('inconsistent order totals and corrupt balances block all approval writes', async () => {
  for (const corrupt of ['order', 'balance']) {
    const f = fixture();
    await f.service.create('buyer', input);
    if (corrupt === 'order') f.records.get(root+'/bankOrders/buyer_request').platformFee = 200;
    else f.records.set(root+'/sellerBalances/seller', {heldMinor: -1, lifetimeCreditedMinor:0, creditedOrders:0});
    await assert.rejects(f.service.approve('admin', approval));
    assert.equal(f.records.get(root+'/bankOrders/buyer_request').status, 'pending');
    assert.ok(!f.records.has(root+'/bankLedger/buyer_request'));
  }
});
test('legacy paid orders are not silently credited during retries', async () => {
  const f = fixture();
  await f.service.create('buyer', input);
  f.records.get(root+'/bankOrders/buyer_request').status = 'paid';
  await assert.rejects(f.service.approve('admin', approval));
  assert.ok(!f.records.has(root+'/sellerBalances/seller'));
});
