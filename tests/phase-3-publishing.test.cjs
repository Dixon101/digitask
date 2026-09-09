const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const store = fs.readFileSync('public/digitask-my-store-page.html', 'utf8');
test('new product cards handle missing counters and encode seller-controlled content', async () => {
  const container = { classList: { add() {}, remove() {} }, innerHTML: '' };
  const context = vm.createContext({ myProductsContainer: container, myProducts: [{
    id: 'safe', title: '<img src=x onerror=alert(1)>', previewImageUrl: 'javascript:alert(1)', status: 'published'
  }] });
  vm.runInContext(store.slice(store.indexOf('async function renderMyProducts()'), store.indexOf('// --- My Purchases Tab Logic')), context);
  await context.renderMyProducts();
  assert.match(container.innerHTML, /&lt;img/);
  assert.doesNotMatch(container.innerHTML, /javascript:|NaN|undefined/);
});
test('catalog uses uploaded preview images and encodes text and link attributes', () => {
  const source = fs.readFileSync('public/digitask-digital-product-store.html', 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function renderProductCard('), source.indexOf('function renderCategoryFilters(')), context);
  const html = context.renderProductCard({ id: 'x" onclick="alert(1)', title: '<script>alert(1)</script>',
    description: '<img onerror=alert(1)>', previewUrls: ['https://example.test/image.png'], price: 100 });
  assert.match(html, /https:\/\/example.test\/image.png/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /onclick=|<script>|<img onerror/);
});
test('edit form awaits durable save and retains inputs on failure', async () => {
  for (const fail of [false, true]) {
    let handler, closed = false, written;
    const field = value => ({ value, classList: { add() {}, remove() {} } });
    const context = vm.createContext({
      editProductForm: { addEventListener: (_, fn) => { handler = fn; } },
      editProductIdInput: field('book'), editProductTitleInput: field(' Title '),
      editProductDescriptionTextarea: field(' Description '), editProductPriceInput: field('125'),
      editProductLicenseSelect: field('personal'), editProductSubmitBtn: { disabled: false },
      editProductSubmitText: field(''), editProductSubmitSpinner: field(''),
      document: { querySelectorAll: () => [] }, displayMessage() {}, showError() {},
      closeModal: () => { closed = true; },
      productRecord: id => ({ update: async data => { assert.equal(id, 'book'); written = data; if (fail) throw Error('offline'); } })
    });
    const start = store.indexOf("editProductForm.addEventListener('submit'");
    const end = store.indexOf('\n      });', start) + '\n      });'.length;
    vm.runInContext(store.slice(start, end), context);
    await handler({ preventDefault() {} });
    assert.equal(written.price, 125);
    assert.equal(written.title, 'Title');
    assert.equal(closed, !fail);
    assert.equal(context.editProductSubmitBtn.disabled, false);
    assert.equal(context.editProductTitleInput.value, ' Title ');
  }
});
