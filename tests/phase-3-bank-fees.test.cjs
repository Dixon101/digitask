const { test } = require('node:test');
const assert = require('node:assert/strict');
const fees = require('../public/js/bank-fees.js');
test('admin percentages convert to fractions and explicit zero fees remain zero', () => {
  assert.equal(fees.settings('10', '100').platformFeeRate, 0.1);
  assert.deepEqual(fees.quote(1000, fees.settings('0', '0')), { price: 1000, platformFee: 0, processingFee: 0, total: 1000 });
});
test('bank quotes prefer fixed processing fees and round monetary components', () => {
  assert.deepEqual(fees.quote(1000, fees.settings('10', '100')), { price: 1000, platformFee: 100, processingFee: 100, total: 1200 });
  assert.equal(fees.quote(1000, { platformFeeRate: 0.1, processingFeeRate: 0.02 }).total, 1120);
  assert.equal(fees.quote(1.01, fees.settings('10', '0')).total, 1.11);
});
test('missing, invalid and excessive rates fail instead of silently charging defaults', () => {
  for (const value of ['', null, 'Infinity', -1, 101, true]) assert.throws(() => fees.settings(value, 0));
  assert.throws(() => fees.quote(1000, {}));
  assert.throws(() => fees.quote(0, fees.settings(10, 0)));
});
