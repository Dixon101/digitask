document.addEventListener('DOMContentLoaded', () => {
  const adminPage = location.pathname.includes('admin-finance');
  const panel = document.createElement('section');
  panel.className = 'bg-white rounded-xl p-6 m-6 shadow';
  panel.hidden = true;
  const heading = document.createElement('h2');
  heading.textContent = adminPage ? 'Bank payment review' : 'Bank purchases and downloads';
  panel.appendChild(heading);
  const accounting = document.createElement('div');
  panel.appendChild(accounting);
  const payoutControls = document.createElement('div');
  panel.appendChild(payoutControls);
  const disputes = document.createElement('div');
  panel.appendChild(disputes);
  const list = document.createElement('div');
  panel.appendChild(list);
  document.body.appendChild(panel);
  const auth = window.auth || firebase.auth();
  const db = window.db || firebase.firestore();
  const root = db.collection('artifacts').doc('default-digitask-app');
  let unsubscribe;
  let unsubscribeAccounting;
  let unsubscribeDisputes;
  auth.onAuthStateChanged(async user => {
    if (unsubscribe) unsubscribe();
    if (unsubscribeAccounting) unsubscribeAccounting();
    if (unsubscribeDisputes) unsubscribeDisputes();
    panel.hidden = true;
    list.textContent = '';
    accounting.textContent = '';
    payoutControls.textContent = '';
    disputes.textContent = '';
    if (!user) return;
    try {
      if (adminPage && !(await root.collection('admins').doc(user.uid).get()).exists) return;
      if (auth.currentUser?.uid !== user.uid) return;
      panel.hidden = false;
      if (adminPage) {
        window.mountBankPayoutControls(payoutControls, root, auth);
        unsubscribeDisputes = root.collection('bankDisputes').where('status','==','open').limit(100).onSnapshot(snapshot => {
          disputes.textContent = '';
          const heading = document.createElement('h3');
          heading.className = 'text-lg font-semibold mt-4';
          heading.textContent = 'Open bank disputes (up to 100)';
          disputes.appendChild(heading);
          snapshot.docs.forEach(entry => {
            const row = document.createElement('p');
            row.className = 'border rounded p-3 my-2';
            row.textContent = 'Order ' + entry.id + ': ' + entry.data().reason;
            disputes.appendChild(row);
          });
        }, () => {disputes.textContent = 'Could not load open disputes.';});
        unsubscribeAccounting = root.collection('bankLedger').orderBy('createdAt', 'desc').limit(100).onSnapshot(snapshot => {
          accounting.textContent = '';
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = 'Bank accounting records — latest 100';
          details.appendChild(summary);
          snapshot.docs.forEach(entry => {
            const data = entry.data();
            const row = document.createElement('p');
            const amount = key => '₦' + (data[key] / 100).toLocaleString('en-NG', {minimumFractionDigits: 2});
            row.textContent = 'Order ' + entry.id + ' · Seller ' + data.sellerId +
              ' · Received ' + amount('receivedMinor') + ' · Seller earnings credited ' + amount('sellerMinor') +
              ' · Platform fee ' + amount('commissionMinor') + ' · Processing fee ' + amount('processingMinor');
            details.appendChild(row);
          });
          accounting.appendChild(details);
        }, () => { accounting.textContent = 'Accounting records could not be loaded.'; });
      } else {
        unsubscribeAccounting = root.collection('sellerBalances').doc(user.uid).onSnapshot(snapshot => {
          const balance = snapshot.exists ? snapshot.data() : null;
          accounting.textContent = balance ? 'Bank-sale earnings held: ₦' +
            (balance.heldMinor / 100).toLocaleString('en-NG', {minimumFractionDigits: 2}) +
            ' · Reserved: ₦' + ((balance.reservedMinor || 0) / 100).toLocaleString('en-NG') +
            ' · Paid: ₦' + ((balance.paidMinor || 0) / 100).toLocaleString('en-NG') +
            ' · Earnings reversed for refunds: ₦' + ((balance.refundedMinor || 0) / 100).toLocaleString('en-NG') +
            '. Payouts are managed by the administrator.' : '';
        }, () => { accounting.textContent = 'Seller balance could not be loaded.'; });
      }
      const query = adminPage ? root.collection('bankOrders').where('status', '==', 'pending').limit(100)
        : root.collection('users').doc(user.uid).collection('bankPurchases');
      unsubscribe = query.onSnapshot(snapshot => {
        list.textContent = snapshot.empty ? 'No bank orders to show.' : '';
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const row = document.createElement('div');
          row.className = 'border rounded p-3 my-2';
          const title = document.createElement('p');
          title.textContent = data.title + ' — Order: ' + doc.id + (adminPage ? ' — ₦' + data.total : '');
          row.appendChild(title);
          const status = document.createElement('p');
          if (adminPage) {
            const form = document.createElement('form');
            form.innerHTML = '<label>Bank receipt reference <input name="reference" required minlength="4" maxlength="200"></label> <label>Amount credited (₦) <input name="amount" type="number" min="0" step="0.01" required></label> <label><input name="confirmed" type="checkbox" required> I checked the credit directly in the bank account and matched it to this order.</label> <button>Confirm payment and unlock files</button>';
            form.onsubmit = async event => {
              event.preventDefault();
              const button = form.querySelector('button');
              if (button.disabled) return;
              button.disabled = true;
              try {
                await bankOrderCall('approveBankOrder', { orderId: doc.id, bankReference: form.elements.reference.value,
                  receivedAmount: Number(form.elements.amount.value), confirmedInBank: form.elements.confirmed.checked }, auth.currentUser);
                status.textContent = 'Payment confirmed.';
              } catch (error) { status.textContent = error.message; button.disabled = false; }
            };
            row.appendChild(form);
          } else if (data.status === 'refunded') {
            status.textContent = 'Refund recorded. Downloads are unavailable.';
          } else {
            const report = document.createElement('form');
            const label = document.createElement('label');
            label.className = 'block text-sm font-medium text-gray-700 mt-3';
            label.textContent = 'Report a problem with this purchase';
            const reason = document.createElement('textarea');
            reason.className = 'w-full p-2 rounded-lg border border-gray-200';
            reason.minLength = 10; reason.maxLength = 1000; reason.required = true;
            label.appendChild(reason);
            const submit = document.createElement('button');
            submit.type = 'submit'; submit.textContent = 'Submit for admin review';
            submit.className = 'bg-indigo-600 text-white px-4 py-2 rounded-lg my-2';
            report.appendChild(label); report.appendChild(submit);
            report.onsubmit = async event => {
              event.preventDefault();
              if (submit.disabled) return;
              submit.disabled = true;
              try {
                await bankOrderCall('reportBankDispute',{orderId:doc.id,reason:reason.value},auth.currentUser);
                reason.disabled = true;
                status.textContent = 'Report received for admin review. Repeated submissions will not create another case.';
              } catch(error) {status.textContent = error.message; submit.disabled = false;}
            };
            row.appendChild(report);
            (data.filePaths || []).forEach((_, fileIndex) => {
              const button = document.createElement('button');
              button.textContent = 'Download file ' + (fileIndex + 1);
              button.onclick = async () => {
                button.disabled = true;
                try {
                  const result = await bankOrderCall('downloadBankPurchase', { orderId: doc.id, fileIndex }, auth.currentUser);
                  const url = new URL(result.url);
                  if (url.protocol !== 'https:') throw Error('Invalid download link.');
                  const link = document.createElement('a');
                  link.href = url.href;
                  link.rel = 'noopener noreferrer';
                  link.target = '_blank';
                  link.click();
                  status.textContent = 'Download link expires after one minute.';
                } catch (error) { status.textContent = error.message; }
                finally { button.disabled = false; }
              };
              row.appendChild(button);
            });
          }
          row.appendChild(status);
          list.appendChild(row);
        });
      }, () => { list.textContent = 'Could not load bank orders. Please reload.'; });
    } catch { panel.hidden = false; list.textContent = 'Could not verify access.'; }
  });
});
