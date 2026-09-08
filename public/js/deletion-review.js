import { collection, query, where, limit, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

export function mountDeletionReview(db, auth) {
  const root = 'artifacts/default-digitask-app';
  const section = document.createElement('section');
  section.className = 'm-6 p-6 bg-white rounded-lg';
  section.hidden = true;
  const heading = document.createElement('h2');
  heading.textContent = 'Account deletion requests';
  heading.className = 'text-xl font-bold mb-3';
  const refresh = document.createElement('button');
  refresh.textContent = 'Refresh requests';
  refresh.className = 'px-4 py-2 bg-indigo-600 text-white rounded';
  const results = document.createElement('div');
  section.append(heading, refresh, results);
  document.querySelector('main').append(section);
  async function load() {
    results.textContent = 'Loading requests…';
    refresh.disabled = true;
    try {
      const snapshot = await getDocs(query(collection(db, root + '/deletionRequests'),
        where('status', 'in', ['requested', 'approved', 'processing']), limit(50)));
      results.textContent = snapshot.empty ? 'No pending requests.' : '';
      for (const request of snapshot.docs) {
        const row = document.createElement('div');
        row.className = 'border-t mt-4 pt-4';
        const label = document.createElement('p');
        label.textContent = 'Account ' + request.id + ' — ' + request.data().status;
        row.append(label);
        if (request.data().status === 'requested') {
          const review = document.createElement('label');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          review.append(checkbox, document.createTextNode(' I reviewed outstanding payments, disputes and shared work. Account closure can proceed; retained records will remain available to administrators.'));
          row.append(review);
          for (const status of ['approved', 'rejected']) {
            const button = document.createElement('button');
            button.className = 'block mt-2 px-3 py-2 border rounded';
            button.textContent = status === 'approved' ? 'Approve account closure' : 'Reject request';
            button.disabled = status === 'approved';
            if (status === 'approved') checkbox.addEventListener('change', () => { button.disabled = !checkbox.checked; });
            button.addEventListener('click', async () => {
              if (!confirm(status === 'approved' ? 'Close this account after review? This permanently removes sign-in and personal settings.' : 'Reject this deletion request?')) return;
              button.disabled = true;
              try {
                await updateDoc(doc(db, root + '/deletionRequests/' + request.id), {
                  status, reviewedBy: auth.currentUser.uid, reviewedAt: serverTimestamp()
                });
                await load();
              } catch { label.textContent = 'Could not save the review. Refresh to check the request status.'; }
            });
            row.append(button);
          }
        }
        results.append(row);
      }
    } catch { results.textContent = 'Unable to load deletion requests. Check administrator access.'; }
    finally { refresh.disabled = false; }
  }
  refresh.addEventListener('click', load);
  onAuthStateChanged(auth, async user => {
    section.hidden = true;
    if (!user) return;
    try {
      const member = await getDoc(doc(db, root + '/admins/' + user.uid));
      if (member.exists()) { section.hidden = false; await load(); }
    } catch { /* Access remains hidden; Firestore rules enforce authorization. */ }
  });
}
