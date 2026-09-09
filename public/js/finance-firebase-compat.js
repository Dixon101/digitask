// Bridge the finance page's function-style calls to its existing compat SDK.
// Keep a single Firebase app/Auth instance.
window.collection = (database, ...path) => database.collection(path.join('/'));
window.doc = (database, ...path) => database.doc(path.join('/'));
window.getDoc = async reference => {
  const snapshot = await reference.get();
  return { id: snapshot.id, exists: () => snapshot.exists, data: () => snapshot.data() };
};
window.getDocs = reference => reference.get();
window.query = (reference, ...constraints) => constraints.reduce((query, apply) => apply(query), reference);
window.where = (...args) => query => query.where(...args);
window.orderBy = (...args) => query => query.orderBy(...args);
window.onAuthStateChanged = (auth, callback) => auth.onAuthStateChanged(callback);
window.signOut = auth => auth.signOut();
window.setDoc = (reference, data, options) => options ? reference.set(data, options) : reference.set(data);
window.updateDoc = (reference, data) => reference.update(data);
