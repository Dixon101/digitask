(function(root) {
  'use strict';
  function number(value, label, maximum) {
    if (value === '' || value == null || typeof value === 'boolean') throw Error(label + ' is required.');
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0 || result > maximum) throw Error(label + ' is outside the allowed range.');
    return result;
  }
  function settings(percent, amount) {
    return { platformFeeRate: number(percent, 'Commission percentage', 100) / 100,
      processingFeeAmount: number(amount, 'Processing fee', 100000000), processingFeeRate: 0 };
  }
  function quote(price, config) {
    const subtotal = number(price, 'Price', 100000000);
    if (subtotal === 0) throw Error('Price must be greater than zero.');
    const rate = number(config.platformFeeRate, 'Commission rate', 1);
    const fee = config.processingFeeAmount != null
      ? number(config.processingFeeAmount, 'Processing fee', 100000000)
      : subtotal * number(config.processingFeeRate, 'Processing rate', 1);
    const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
    const platformFee = round(subtotal * rate);
    const processingFee = round(fee);
    return { price: round(subtotal), platformFee, processingFee, total: round(round(subtotal) + platformFee + processingFee) };
  }
  root.DigitaskBankFees = { settings, quote };
  if (typeof module !== 'undefined') module.exports = root.DigitaskBankFees;
})(typeof window !== 'undefined' ? window : globalThis);
