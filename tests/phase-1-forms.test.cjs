const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
const source = read('digitask-gig-creation-and-digital-product-upload.html');
const element = () => ({ value: 'Valid', checked: false, disabled: false, files: [{}],
  classList: { add() {}, remove() {} }, reset() { this.resets = (this.resets || 0) + 1; },
  addEventListener(name, callback) { this[name] = callback; } });

function publishing() {
  const context = { console: { error() {} }, currentUserId: 'qa', userProfileData: {},
    appId: 'test', db: {}, collection() {}, serverTimestamp() {}, messages: [],
    displayMessage(message) { context.messages.push(message); },
    renderGigSkills() {}, updateGigPreview() {}, updateProductPreview() {},
    DataTransfer: function () { this.files = []; } };
  for (const prefix of ['gig', 'product']) {
    for (const suffix of ['Form','TitleInput','DescriptionInput','CategorySelect','PriceInput','DeliveryInput','LicenseSelect',
      'TitleError','DescriptionError','CategoryError','PriceError','DeliveryError','ImagesError','LicenseError','FilesError','PreviewsError',
      'ImagesInput','FilesInput','PreviewsInput','AcceptOffersCheckbox','FeaturedCheckbox']) context[prefix + suffix] = element();
    for (const suffix of ['Btn','Text','Spinner']) context['publish' + (prefix === 'gig' ? 'Gig' : 'Product') + suffix] = element();
    context[prefix + 'PriceInput'].value = '100';
    context[prefix + 'DeliveryInput'].value = '3';
  }
  context.gigSkills = [];
  context.gigImages = { files: [] };
  context.productFiles = { files: [{}] };
  context.productPreviews = { files: [{}] };
  context.uploadFilesToStorage = async () => [];
  context.writes = [];
  context.addDoc = async (ref, data) => context.writes.push(data);
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('    function validateGigForm'), source.indexOf('    // --- Product Form Logic ---')), context);
  vm.runInContext(source.slice(source.indexOf('    function validateProductForm'), source.indexOf('    // --- Initialization ---', source.indexOf('    function validateProductForm'))), context);
  const start = source.indexOf("    gigForm.addEventListener('submit'");
  vm.runInContext(source.slice(start, source.indexOf('    window.removeGigImage', start)), context);
  return context;
}

test('publishing validates before writes, including non-finite prices and fractional days', async () => {
  const c = publishing();
  c.gigTitleInput.value = '';
  await c.gigForm.submit({ preventDefault() {} });
  c.productPriceInput.value = 'Infinity';
  await c.productForm.submit({ preventDefault() {} });
  c.gigTitleInput.value = 'Valid'; c.gigDeliveryInput.value = '1.5';
  await c.gigForm.submit({ preventDefault() {} });
  assert.equal(c.writes.length, 0);
});

test('publishing blocks duplicate submissions and resets only after a durable write', async () => {
  const c = publishing();
  let finish;
  c.uploadFilesToStorage = () => new Promise(resolve => { finish = resolve; });
  const first = c.gigForm.submit({ preventDefault() {} });
  await c.gigForm.submit({ preventDefault() {} });
  assert.equal(c.gigForm.resets, undefined);
  assert.equal(c.writes.length, 0);
  finish([]); await first;
  assert.equal(c.writes.length, 1);
  assert.equal(c.gigForm.resets, 1);
  assert.equal(c.publishGigBtn.disabled, false);
});

test('failed product writes retain inputs and re-enable submission', async () => {
  const c = publishing();
  c.addDoc = async () => { throw new Error('Permission denied'); };
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.productForm.resets, undefined);
  assert.equal(c.productTitleInput.value, 'Valid');
  assert.equal(c.publishProductBtn.disabled, false);
  assert.match(c.messages.at(-1), /Permission denied/);
});

test('My Store subscribes to settings through its compat database', () => {
  const html = read('digitask-my-store-page.html');
  const start = html.indexOf('        const platformSettingsRef =');
  const end = html.indexOf('\n      } else {', start);
  let callback;
  const reference = { collection: () => reference, doc: () => reference, onSnapshot: fn => { callback = fn; } };
  const c = { db: reference, platformSettings: null };
  vm.runInNewContext(html.slice(start, end), c);
  callback({ exists: true, data: () => ({ marker: 'loaded' }) });
  assert.equal(c.platformSettings.marker, 'loaded');
  callback({ exists: false });
  assert.equal(c.platformSettings.bankDetails.name, '');
});

test('Settings has one implementation and publishing has one handler per form', () => {
  const settings = read('digitask-settings-page.html');
  assert.ok(!settings.includes('Mock authentication'));
  assert.equal((settings.match(/editFieldForm.addEventListener\('submit'/g) || []).length, 1);
  for (const name of ['gigForm', 'productForm']) {
    assert.equal((source.match(new RegExp(name + ".addEventListener\\('submit'", 'g')) || []).length, 1);
  }
  assert.ok(!source.includes('featured-modal.html'));
  assert.ok(!source.includes('Simulated'));
});
