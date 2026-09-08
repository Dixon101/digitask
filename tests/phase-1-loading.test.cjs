const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

test('dashboard waits for both roles, deduplicates gigs and preserves errors', () => {
  const html = read('digitask-dashboard.html');
  const code = html.slice(html.indexOf('// 2. Listen for Active Gigs'), html.indexOf('// 3. Listen for Recent Activity'));
  const listeners = [], renders = [], list = {};
  const context = { console: { error() {} }, activeGigsList: list, displayMessage() {},
    renderActiveGigs: gigs => renders.push(gigs), window: {
      collection() {}, query() {}, where() {},
      onSnapshot: (query, success, failure) => listeners.push({ success, failure })
    } };
  vm.runInNewContext(code, context);
  const snapshot = ids => ({ forEach: fn => ids.forEach(id => fn({ id, data: () => ({ title: id }) })) });
  listeners[0].success(snapshot(['shared']));
  assert.equal(renders.length, 0);
  listeners[1].success(snapshot(['shared', 'client']));
  assert.equal(renders[0].length, 2);
  listeners[0].failure({ code: 'failed-precondition', message: 'Missing index' });
  listeners[1].success(snapshot([]));
  assert.match(list.textContent, /Unable to load/);
  assert.equal(renders.length, 1);
  listeners[0].success(snapshot([]));
  assert.equal(renders.at(-1).length, 0);
});

test('dashboard treats gig titles as text', async () => {
  const html = read('digitask-dashboard.html');
  const code = html.slice(html.indexOf('async function renderActiveGigs'), html.indexOf('/** Renders recent activity'));
  const context = { activeGigsList: {} };
  vm.createContext(context);
  vm.runInContext(code, context);
  await context.renderActiveGigs([{ title: '<img onerror="bad()">', status: 'active' }]);
  assert.ok(!context.activeGigsList.innerHTML.includes('<img'));
  assert.match(context.activeGigsList.innerHTML, /&lt;img/);
});

function statsHarness() {
  const html = read('digitask-stats-page.html');
  const start = html.lastIndexOf('<script type="module">');
  const end = html.indexOf('</script>', start);
  assert.ok(end > start, 'Stats module must have a closing script tag');
  const code = html.slice(start + '<script type="module">'.length, end).replace(/^\s*import .*?;\s*$/gm, '');
  const elements = new Map(), listeners = [];
  const element = () => ({ style: {}, textContent: '', innerHTML: '', children: [],
    append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; } });
  const context = { console: { error() {} }, window: { location: {} },
    document: { getElementById(id) { if (id === 'profile-avatar') return null;
      if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element },
    initializeApp() {}, getFirestore() {}, getAuth() {}, doc() {}, collection() {}, query() {}, orderBy() {}, limit() {},
    onAuthStateChanged: (auth, callback) => { context.authenticate = callback; },
    onSnapshot: (ref, success, failure) => listeners.push({ success, failure }) };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, elements, listeners };
}

test('stats initializes, counts completed IDs and separates failures from empty data', async () => {
  const { context, elements, listeners } = statsHarness();
  await context.authenticate({ uid: 'test-user' });
  assert.equal(listeners.length, 2);
  listeners[0].success({ exists: () => true, data: () => ({ completedGigs: ['a', 'b'] }) });
  assert.equal(elements.get('completed-gigs').textContent, '2');
  listeners[1].success({ forEach() {} });
  assert.match(elements.get('recent-activity-list').innerHTML, /No recent activity/);
  listeners[0].failure(new Error('Denied'));
  assert.equal(elements.get('total-earnings').textContent, '—');
  listeners[1].failure(new Error('Offline'));
  assert.match(elements.get('recent-activity-list').textContent, /Unable to load/);
});

test('stats safely renders incomplete activity and redirects signed-out visitors', async () => {
  const { context, elements } = statsHarness();
  context.renderRecentActivity([{ description: '<img onerror="bad()">' }, {}]);
  const rows = elements.get('recent-activity-list').children;
  assert.equal(rows[0].children[0].textContent, '<img onerror="bad()">');
  assert.equal(rows[1].children[0].textContent, 'Account activity');
  assert.equal(rows[1].children[1].textContent, 'Date unavailable');
  await context.authenticate(null);
  assert.equal(context.window.location.href, '/digitask-login-and-sign-up-page');
});
