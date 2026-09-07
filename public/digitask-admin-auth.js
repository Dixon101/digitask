// Admin Auth & Route Protection
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAxiGrHzWdEEbLG4HzFSCz7Y0xixuuYVLo",
  authDomain: "digitask001.firebaseapp.com",
  projectId: "digitask001",
  storageBucket: "digitask001.firebasestorage.app",
  messagingSenderId: "970192259186",
  appId: "1:970192259186:web:a5f12a2365cc6e9bab9aeb",
  measurementId: "G-0XSJ6X6ED5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let inactivityTimeout;
const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutes

// Note: Authentication check is now handled by individual pages
// This prevents conflicts when multiple auth checks run simultaneously

// Handle user logout
async function handleLogout() {
  try {
    await signOut(auth);
    window.location.href = '/digitask-admin-login';
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// Reset inactivity timer on user activity
function resetInactivityTimer() {
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }
  
  inactivityTimeout = setTimeout(() => {
    signOut(auth).then(() => {
      window.location.href = '/digitask-admin-login';
    });
  }, INACTIVITY_LIMIT);
}

// Add event listeners for user activity
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);
document.addEventListener('click', resetInactivityTimer);

// Check if user is authenticated and has admin role
function checkAdminAuth() {
  console.log('Starting authentication check...');
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed. User:', user ? user.uid : 'null');
      
      if (!user) {
        console.log('No user found, redirecting to login');
        window.location.href = '/digitask-admin-login';
        reject(new Error('User not authenticated'));
        return;
      }
      
      try {
        console.log('Checking admin status for user:', user.uid);
        // Check if user is admin
        const adminDoc = await getDoc(doc(db, 'artifacts', 'default-digitask-app', 'admins', user.uid));
        console.log('Admin document exists:', adminDoc.exists());
        
        if (!adminDoc.exists()) {
          console.log('User is not an admin, signing out');
          // User is not an admin, sign them out
          await signOut(auth);
          window.location.href = '/digitask-admin-login?error=not_admin';
          reject(new Error('User is not an admin'));
          return;
        }
        
        console.log('User is authenticated and is an admin');
        // User is authenticated and is an admin, show the page
        resetInactivityTimer();
        resolve(user);
        
      } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/digitask-admin-login?error=auth_error';
        reject(error);
      }
    });
  });
}

// Helper function to set up logout button
function setupLogoutButton() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

// Export functions to be used in other modules
export { checkAdminAuth, setupLogoutButton };
