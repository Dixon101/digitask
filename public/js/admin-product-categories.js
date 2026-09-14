document.addEventListener('DOMContentLoaded', () => {
  const root = window.db.collection('artifacts').doc('default-digitask-app');
  const categories = root.collection('productCategories');
  const panel = document.createElement('section');
  panel.hidden = true;
  panel.className = 'bg-white rounded-xl p-4 sm:p-6 my-6 shadow-md min-w-0';
  panel.innerHTML = '<h2 class="text-xl font-bold">Product categories</h2><p class="text-gray-600 mt-2">Add a category or rename an existing one. Keep its ID unchanged so existing products stay linked.</p><form class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4"><label class="block text-sm font-medium">Category ID<input name="categoryId" required maxlength="80" pattern="[a-z0-9][a-z0-9_-]*" placeholder="e.g. templates" class="block w-full p-2 mt-1 rounded-lg border border-gray-200"></label><label class="block text-sm font-medium">Display name<input name="categoryName" required maxlength="100" class="block w-full p-2 mt-1 rounded-lg border border-gray-200"></label><button class="bg-indigo-600 text-white px-4 py-3 rounded-lg font-semibold" disabled>Save category</button></form><p role="status" class="my-3"></p><ul class="space-y-2"></ul>';
  (document.querySelector('main') || document.body).append(panel);
  const form = panel.querySelector('form'), button = form.querySelector('button');
  const status = panel.querySelector('[role="status"]'), list = panel.querySelector('ul');
  let generation = 0, administrator = false, unsubscribe = () => {};
  window.auth.onAuthStateChanged(async user => {
    const request = ++generation;
    administrator = false; unsubscribe(); panel.hidden = true; button.disabled = true;
    list.replaceChildren(); form.reset();
    if (!user) return;
    try {
      const admin = await root.collection('admins').doc(user.uid).get();
      if (request !== generation || !admin.exists) return;
      administrator = true; panel.hidden = false;
      unsubscribe = categories.onSnapshot(snapshot => {
        if (request !== generation) return;
        list.replaceChildren();
        snapshot.docs.sort((a,b) => a.id.localeCompare(b.id)).forEach(category => {
          const item = document.createElement('li'), edit = document.createElement('button');
          edit.type = 'button'; edit.className = 'text-indigo-600 hover:underline text-left break-words';
          const name = category.data().name || category.id;
          edit.textContent = `${name} (${category.id}) — Edit`;
          edit.addEventListener('click', () => {
            form.elements.categoryId.value = category.id;
            form.elements.categoryName.value = name;
            form.elements.categoryName.focus();
          });
          item.append(edit); list.append(item);
        });
        status.textContent = snapshot.empty ? 'No categories yet. Add one to enable product publishing.' : '';
        button.disabled = false;
      }, () => { if (request === generation) { status.textContent = 'Could not load categories. Reload to retry.'; button.disabled = true; } });
    } catch { if (request === generation) status.textContent = 'Could not verify administrator access.'; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!administrator || button.disabled) return;
    const id = form.elements.categoryId.value.trim(), name = form.elements.categoryName.value.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id) || !name || name.length > 100) {
      status.textContent = 'Enter a valid category ID and display name.'; return;
    }
    const request = generation;
    button.disabled = true; form.inert = true;
    try {
      await categories.doc(id).set({ name }, { merge: true });
      if (request === generation) status.textContent = 'Category saved. Store filters and publishing use this category.';
    } catch { if (request === generation) status.textContent = 'Category was not saved. Your entries are retained; try again.'; }
    finally { form.inert = false; if (request === generation) button.disabled = !administrator; }
  });
  window.addEventListener('beforeunload', () => unsubscribe());
});
