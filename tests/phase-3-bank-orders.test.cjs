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
