window.mountBankPayoutControls = function(container, root, auth) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Manage seller bank payouts';
  details.appendChild(summary);
  const help = document.createElement('p');
  help.textContent = 'Reserve one order at a time. Check the seller’s bank details before sending money. Confirm only a completed transfer; these controls do not send money.';
  details.appendChild(help);
  const form = document.createElement('form');
  const field = (name, label, type = 'text') => {
    const wrapper = document.createElement('label');
    wrapper.className = 'block text-sm font-medium text-gray-700 mb-2';
    wrapper.textContent = label + ' ';
    const input = document.createElement('input');
    input.type = type; input.name = name;
    input.className = type === 'checkbox' ? 'mr-2' : 'w-full p-2 rounded-lg border border-gray-200';
    wrapper.appendChild(input); form.appendChild(wrapper); return input;
  };
  field('orderId', 'Order ID').required = true;
  field('bank', 'Bank name');
  field('accountName', 'Account name');
  field('accountNumber', 'Account number').maxLength = 10;
  field('reference', 'Completed transfer reference');
  const amount = field('amount', 'Amount sent (₦)', 'number'); amount.step = '0.01';
  field('reason', 'Cancellation reason');
  field('verified', 'I verified the recipient for a reservation, confirmed the transfer for completion, or confirmed no transfer was sent for cancellation.', 'checkbox');
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  let loadedId, revision, busy = false;
  const buttons = [];
  async function load() {
    loadedId = undefined;
    const orderId = form.elements.orderId.value.trim();
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(orderId)) throw Error('Enter a valid order ID.');
    const [order, payout] = await Promise.all([root.collection('bankOrders').doc(orderId).get(), root.collection('bankPayouts').doc(orderId).get()]);
    if (!order.exists) throw Error('Order not found.');
    const data = order.data(), existing = payout.exists ? payout.data() : null;
    revision = existing?.revision ?? 0;
    loadedId = orderId;
    status.textContent = 'Seller ' + data.sellerId + ' · Earnings ₦' + (data.sellerCreditMinor / 100).toLocaleString() +
      ' · Payout status: ' + (existing?.status || data.settlementStatus);
    for (const [input, key] of [['bank','name'], ['accountName','accountName'], ['accountNumber','accountNumber']])
      form.elements[input].value = existing?.bankDetails?.[key] || '';
    form.elements.verified.checked = false;
  }
  for (const [action, label] of [['load','Load order'], ['reserve','Reserve payout'], ['confirm','Record completed transfer'], ['cancel','Cancel unpaid reservation']]) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.className = 'bg-indigo-600 text-white px-4 py-2 rounded-lg m-1';
    buttons.push(button); form.appendChild(button);
    button.onclick = async () => {
      if (busy) return;
      busy = true; buttons.forEach(b => b.disabled = true);
      try {
        if (action === 'load') { await load(); return; }
        if (!loadedId || loadedId !== form.elements.orderId.value.trim()) throw Error('Load this order first.');
        const e = form.elements;
        const result = await bankOrderCall('manageBankPayout', {action, orderId:loadedId, expectedRevision:revision,
          bankDetails:{name:e.bank.value, accountName:e.accountName.value, accountNumber:e.accountNumber.value},
          recipientVerified:e.verified.checked, confirmedSent:e.verified.checked, confirmedNotSent:e.verified.checked,
          bankReference:e.reference.value, sentAmount:Number(e.amount.value), reason:e.reason.value}, auth.currentUser);
        await load();
        status.textContent += ' · Saved: ' + result.status;
      } catch (error) { status.textContent = error.message + ' Reload the order before retrying.'; loadedId = undefined; }
      finally { busy = false; buttons.forEach(b => b.disabled = false); }
    };
  }
  form.onsubmit = event => event.preventDefault();
  details.appendChild(form); details.appendChild(status); container.appendChild(details);
};
