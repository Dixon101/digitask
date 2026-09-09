document.addEventListener('DOMContentLoaded', () => {
  const adminPage = location.pathname.includes('admin-finance');
  const panel = document.createElement('section');
  panel.className = 'bg-white rounded-xl p-6 m-6 shadow';
  panel.hidden = true;
  const heading = document.createElement('h2');
  heading.textContent = adminPage ? 'Bank payment review' : 'Bank purchases and downloads';
  panel.appendChild(heading);
  const list = document.createElement('div');
  panel.appendChild(list);
  document.body.appendChild(panel);
  const auth = window.auth || firebase.auth();
  const db = window.db || firebase.firestore();
  const root = db.collection('artifacts').doc('default-digitask-app');
  let unsubscribe;
  auth.onAuthStateChanged(async user => {
    if (unsubscribe) unsubscribe();
    panel.hidden = true;
    list.textContent = '';
    if (!user) return;
    try {
      if (adminPage && !(await root.collection('admins').doc(user.uid).get()).exists) return;
      if (auth.currentUser?.uid !== user.uid) return;
      panel.hidden = false;
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
          } else {
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
