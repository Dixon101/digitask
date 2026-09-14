const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
const source = read('digitask-gig-creation-and-digital-product-upload.html');
const element = () => ({ setAttribute() {}, removeAttribute() {}, value: 'Valid', checked: false, disabled: false, files: [{}],
  classList: { add() {}, remove() {} }, reset() { this.resets = (this.resets || 0) + 1; },
  addEventListener(name, callback) { this[name] = callback; } });

function publishing(realUploads = false) {
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
  if (realUploads) {
    context.crypto = require('node:crypto').webcrypto;
    context.storage = {};
    context.uploads = [];
    context.downloads = [];
    context.storageRef = (_storage, filePath) => filePath;
    context.uploadBytes = async (ref, file) => context.uploads.push({ ref, file });
    context.getDownloadURL = async ref => { context.downloads.push(ref); return 'https://preview.invalid/' + ref; };
    const uploadStart = source.indexOf('    const uploadedFileCache =');
    vm.runInContext(source.slice(uploadStart, start), context);
  }
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


test('gig submission uses validated draft even when fields change during upload', async () => {
  const c = publishing();
  let finish;
  c.gigSkills = ['Design'];
  c.uploadFilesToStorage = () => new Promise(resolve => { finish = resolve; });
  const pending = c.gigForm.submit({ preventDefault() {} });
  c.gigTitleInput.value = 'Changed during upload';
  c.gigPriceInput.value = '-1';
  c.gigSkills.push('Later');
  finish([]); await pending;
  assert.equal(c.writes[0].title, 'Valid');
  assert.equal(c.writes[0].price, 100);
  assert.deepEqual(Array.from(c.writes[0].skills), ['Design']);
});

test('product submission snapshots metadata and previews before uploading', async () => {
  const c = publishing();
  const originalPreview = { name: 'original.png' };
  c.productPreviews.files = [originalPreview];
  let finish, previews;
  c.uploadFilesToStorage = (files, base, privateFiles) => privateFiles
    ? new Promise(resolve => { finish = resolve; })
    : (previews = Array.from(files), Promise.resolve(['preview']));
  const pending = c.productForm.submit({ preventDefault() {} });
  c.productTitleInput.value = 'Later title';
  c.productPreviews.files = [{ name: 'later.png' }];
  finish(['private-file']); await pending;
  assert.equal(c.writes[0].title, 'Valid');
  assert.deepEqual(previews, [originalPreview]);
});

test('real upload helper keeps product files private and publishes preview URLs', async () => {
  const c = publishing(true);
  c.productFiles.files = [{ name: 'download.zip' }];
  c.productPreviews.files = [{ name: 'cover.png' }];
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.uploads.length, 2);
  assert.equal(c.downloads.length, 1);
  assert.match(c.writes[0].filePaths[0], /^artifacts\/test\/product_files\/qa\//);
  assert.ok(!c.writes[0].filePaths[0].startsWith('https:'));
  assert.match(c.writes[0].previewUrls[0], /^https:\/\/preview.invalid\//);
  assert.equal(c.writes[0].sellerId, 'qa');
  assert.equal(c.productForm.resets, 1);
});

test('upload failure preserves product draft and allows a successful retry', async () => {
  const c = publishing(true);
  c.productFiles.files = [{ name: 'download.zip' }];
  c.productPreviews.files = [{ name: 'cover.png' }];
  let fail = true;
  c.uploadBytes = async (ref, file) => { if (fail) throw new Error('Upload unavailable'); c.uploads.push({ref, file}); };
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.writes.length, 0);
  assert.equal(c.productForm.resets, undefined);
  assert.equal(c.productFiles.files.length, 1);
  assert.equal(c.publishProductBtn.disabled, false);
  assert.match(c.messages.at(-1), /Upload unavailable/);
  fail = false;
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.writes.length, 1);
  assert.equal(c.productForm.resets, 1);
});

test('preview URL failure prevents product write and keeps file selections', async () => {
  const c = publishing(true);
  c.getDownloadURL = async () => { throw new Error('Preview URL unavailable'); };
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.writes.length, 0);
  assert.equal(c.productForm.resets, undefined);
  assert.equal(c.productPreviews.files.length, 1);
  assert.equal(c.publishProductBtn.disabled, false);
});

test('signed-out publishing never starts uploads or writes', async () => {
  const c = publishing(true); c.currentUserId = null;
  await c.gigForm.submit({ preventDefault() {} });
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.uploads.length, 0);
  assert.equal(c.writes.length, 0);
});

test('gig attachment failure retains draft and retry creates one owned gig', async () => {
  const c = publishing(true);
  c.gigImages.files = [{ name: 'brief.pdf' }];
  let fail = true;
  c.uploadBytes = async () => { if (fail) throw new Error('Attachment unavailable'); };
  await c.gigForm.submit({ preventDefault() {} });
  assert.equal(c.writes.length, 0);
  assert.equal(c.gigForm.resets, undefined);
  assert.equal(c.publishGigBtn.disabled, false);
  fail = false;
  await c.gigForm.submit({ preventDefault() {} });
  assert.equal(c.writes.length, 1);
  assert.equal(c.writes[0].ownerId, 'qa');
  assert.equal(c.writes[0].clientId, 'qa');
  assert.equal(c.writes[0].fileUrls.length, 1);
  assert.equal(c.gigForm.resets, 1);
});

test('database failure after product uploads preserves draft for retry', async () => {
  const c = publishing(true);
  let fail = true;
  c.addDoc = async (ref, data) => {
    if (fail) throw new Error('Database unavailable');
    c.writes.push(data);
  };
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.uploads.length, 2);
  assert.equal(c.writes.length, 0);
  assert.equal(c.productTitleInput.value, 'Valid');
  assert.equal(c.productForm.resets, undefined);
  assert.equal(c.publishProductBtn.disabled, false);
  fail = false;
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.writes.length, 1);
  assert.equal(c.productForm.resets, 1);
});


test('submission prevents edits until upload completes and restores interaction', async () => {
  const c = publishing(); let finish;
  c.uploadFilesToStorage = () => new Promise(resolve => { finish = resolve; });
  const pending = c.gigForm.submit({ preventDefault() {} });
  assert.equal(c.gigForm.inert, true);
  finish([]); await pending;
  assert.equal(c.gigForm.inert, false);
  c.uploadFilesToStorage = async () => { throw new Error('Upload failed'); };
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.productForm.inert, false);
});

test('retry after database rejection reuses acknowledged private and preview uploads', async () => {
  const c = publishing(true); let fail = true;
  c.addDoc = async (ref, data) => { if (fail) throw new Error('Rejected'); c.writes.push(data); };
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.uploads.length, 2);
  fail = false;
  await c.productForm.submit({ preventDefault() {} });
  assert.equal(c.uploads.length, 2);
  assert.equal(c.downloads.length, 1);
  assert.equal(c.writes.length, 1);
});

test('same-name files get distinct single-segment paths and URL retries skip upload', async () => {
  const c = publishing(true);
  const files = [{name:'../same.zip'}, {name:'../same.zip'}];
  const paths = await c.uploadFilesToStorage(files, 'private', true);
  assert.notEqual(paths[0], paths[1]);
  assert.match(paths[0], /^private\/qa\/[a-f0-9-]+$/);
  const image = {name:'cover.png'};
  c.getDownloadURL = async () => { throw new Error('URL failure'); };
  await assert.rejects(c.uploadFilesToStorage([image], 'preview'), /URL failure/);
  const count = c.uploads.length;
  c.getDownloadURL = async () => 'https://preview.invalid/cover';
  await c.uploadFilesToStorage([image], 'preview');
  assert.equal(c.uploads.length, count);
});
