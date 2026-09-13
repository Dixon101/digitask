document.addEventListener('DOMContentLoaded', () => {
  const panel = document.createElement('section');
  panel.className = 'bg-white rounded-xl p-4 sm:p-6 my-6 shadow-md min-w-0';
  panel.hidden = true;
  panel.innerHTML = '<h2 class="text-xl font-bold">Bank checkout fees</h2><p>Enter 10 for a 10% commission. Zero is allowed. Changes apply to new checkout calculations.</p><form><label>Commission (%) <input name="commission" type="number" min="0" max="100" step="0.01" required></label> <label>Fixed processing fee (₦) <input name="processing" type="number" min="0" max="100000000" step="0.01" required></label> <button type="submit" disabled>Save bank fees</button></form><p role="status"></p>';
  (document.querySelector('main') || document.body).appendChild(panel);
  const form = panel.querySelector('form');
  for (const [name, label] of [['bankName', 'Bank name'], ['accountName', 'Account name'], ['accountNumber', 'Account number']]) {
    const field = document.createElement('label');
    field.textContent = label + ' ';
    const input = document.createElement('input');
    input.name = name;
    input.required = true;
    input.maxLength = 150;
    field.appendChild(input);
    form.insertBefore(field, form.querySelector('button'));
  }
  const button = panel.querySelector('button');
  form.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 mt-4';
  form.querySelectorAll('label').forEach(label => label.className = 'block text-sm font-medium text-gray-700');
  form.querySelectorAll('input').forEach(input => input.className = 'block w-full p-2 mt-1 rounded-lg border border-gray-200');
  button.className = 'bg-indigo-600 text-white px-4 py-3 rounded-lg font-semibold';
  const status = panel.querySelector('[role="status"]');
  const record = window.db.collection('artifacts').doc('default-digitask-app').collection('public').doc('platformSettings');
  let administrator = false;
  window.auth.onAuthStateChanged(async user => {
    administrator = false;
    button.disabled = true;
    panel.hidden = true;
    if (!user) return;
    try {
      const admin = await window.db.collection('artifacts').doc('default-digitask-app').collection('admins').doc(user.uid).get();
      if (!admin.exists) return;
      administrator = true;
      panel.hidden = false;
      const snapshot = await record.get();
      const data = snapshot.exists ? snapshot.data() : {};
      form.elements.commission.value = data.platformFeeRate == null ? '' : data.platformFeeRate * 100;
      form.elements.processing.value = data.processingFeeAmount ?? '';
      form.elements.bankName.value = data.bankDetails?.name ?? '';
      form.elements.accountName.value = data.bankDetails?.accountName ?? '';
      form.elements.accountNumber.value = data.bankDetails?.accountNumber ?? '';
      status.textContent = data.processingFeeAmount == null ? 'Set a fixed processing fee before saving. Existing percentage processing fees will be replaced.' : '';
      button.disabled = false;
    } catch { status.textContent = 'Could not load fee settings. Reload to try again.'; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!administrator || button.disabled) return;
    try {
      const update = DigitaskBankFees.settings(form.elements.commission.value, form.elements.processing.value);
      const bankDetails = { name: form.elements.bankName.value.trim(), accountName: form.elements.accountName.value.trim(), accountNumber: form.elements.accountNumber.value.trim() };
      if (Object.values(bankDetails).some(value => !value)) throw Error('Complete all bank details.');
      if (!/^\d{10}$/.test(bankDetails.accountNumber)) throw Error('Enter a 10-digit Nigerian bank account number.');
      button.disabled = true;
      await record.set({ ...update, bankDetails, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      status.textContent = 'Bank fees saved.';
    } catch (error) { status.textContent = 'Fees were not saved. ' + error.message; }
    finally { button.disabled = !administrator; }
  });
});
