const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../public/digitask-messages-page.html'), 'utf8');
const helpers = source.slice(source.indexOf('    function escapeMessageHtml'), source.indexOf('    function formatFileSize'));
test('message text escapes markup and attachment URLs reject executable schemes', () => {
  const scope = { URL };
  vm.createContext(scope);
  vm.runInContext(helpers, scope);
  assert.equal(scope.escapeMessageHtml('<img src=x onerror="test">'), '&lt;img src=x onerror=&quot;test&quot;&gt;');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.test', 'invalid']) {
    assert.equal(scope.safeAttachmentUrl(url), '');
  }
  assert.equal(scope.safeAttachmentUrl('https://example.test/file?a=1&b=2'), 'https://example.test/file?a=1&amp;b=2');
});
test('actual conversation and message renderers encode untrusted content', () => {
  const nodes = [];
  const scope = {
    URL, window: { currentUserId: 'alice' }, activeConversationId: null,
    selectConversation() {}, formatDate: () => '', formatTime: () => '', formatDateHeader: () => '',
    formatFileSize: () => '1 KB', getFileIconFromMime: () => 'file',
    document: { createElement: () => ({ dataset: {}, innerHTML: '' }) },
    messagesContainer: { innerHTML: '', appendChild: node => nodes.push(node) },
    emptyThreadMessage: { style: {} }
  };
  vm.createContext(scope);
  vm.runInContext(helpers + source.slice(source.indexOf('    function createConversationElement'), source.indexOf('    // --- Conversation List Logic ---')) +
    source.slice(source.indexOf('    function renderMessages'), source.indexOf('    // --- Message Input & Attachment Logic ---')), scope);
  const payload = '<script>test</script>';
  const item = scope.createConversationElement({ id: 'chat', participants: [{ id: 'bob', displayName: payload, initials: payload }], lastMessageText: payload });
  assert.ok(!item.innerHTML.includes('<script>'));
  assert.ok(item.innerHTML.includes('&lt;script&gt;'));
  scope.renderMessages([{ senderId: 'alice', timestamp: new Date(), text: payload,
    attachment: { type: 'image/png', name: '" onerror="test', url: 'javascript:alert(1)' } }]);
  const rendered = nodes.map(node => node.innerHTML).join('');
  assert.ok(rendered.includes('&lt;script&gt;'));
  assert.ok(!rendered.includes('<script>'));
  assert.ok(!rendered.includes('src="javascript:'));
  assert.ok(!rendered.includes(' onerror="'));
});
