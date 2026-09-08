const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('paid product uploads return storage paths and never request a reusable download URL', async () => {
  const source = fs.readFileSync(require.resolve('../public/digitask-gig-creation-and-digital-product-upload.html'), 'utf8');
  const start = source.indexOf('    async function uploadFilesToStorage');
  const end = source.indexOf('    gigForm.addEventListener', start);
  let urlCalls = 0;
  const scope = { currentUserId: 'owner', storage: {}, storageRef: (_, path) => path,
    uploadBytes: async () => {}, getDownloadURL: async () => { urlCalls++; return 'https://example.test/preview'; } };
  vm.createContext(scope);
  vm.runInContext(source.slice(start, end), scope);
  const result = await scope.uploadFilesToStorage([{ name: 'book.pdf' }], 'artifacts/default-digitask-app/product_files', true);
  assert.match(result[0], /^artifacts\/default-digitask-app\/product_files\/owner\//);
  assert.equal(urlCalls, 0);
  await scope.uploadFilesToStorage([{ name: 'cover.png' }], 'artifacts/default-digitask-app/product_previews');
  assert.equal(urlCalls, 1);
});
