const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('admin category refresh preserves IDs and shows explicit unavailable states', () => {
  const source = fs.readFileSync(require.resolve('../public/digitask-gig-creation-and-digital-product-upload.html'),'utf8');
  const start = source.indexOf('       function renderProductCategoryDropdown()');
  const end = source.indexOf('      window.renderPublishingProductCategories', start);
  const select = { value:'templates', options:[], disabled:false,
    set innerHTML(_) { this.options=[]; this.value=''; }, appendChild(option) { this.options.push(option); } };
  const c = { document:{getElementById:()=>select,createElement:()=>({})},
    console:{warn(){},error(){}}, productCategoryState:'ready', productCategories:[{id:'templates',name:'Renamed templates'}] };
  vm.createContext(c); vm.runInContext(source.slice(start,end),c);
  c.renderProductCategoryDropdown();
  assert.equal(select.value,'templates'); assert.equal(select.options[1].textContent,'Renamed templates');
  c.productCategories=[]; c.renderProductCategoryDropdown();
  assert.equal(select.value,''); assert.equal(select.disabled,true);
  assert.match(select.options[0].textContent,/No categories/);
  c.productCategoryState='error'; c.renderProductCategoryDropdown();
  assert.match(select.options[0].textContent,/Could not load/);
});
