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
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');
  
  if (!loginForm) {
    console.error('Login form not found');
    return;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;
    
    if (!email || !password) {
      showError('Please enter both email and password');
      return;
    }

    try {
      showMessage('Signing in...', 'info');
      
      // Sign in with email/password
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      
      // Check if user is admin
      const adminDoc = await db
  .collection('artifacts')
  .doc('default-digitask-app')
  .collection('admins')
  .doc(userCredential.user.uid)
  .get();
      
      if (adminDoc.exists) {
        showMessage('Login successful! Redirecting...', 'success');
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = '/digitask-admin-dashboard';
        }, 1000);
      } else {
        // User is not admin, sign them out
        await auth.signOut();
        throw new Error('Access denied. Admins only.');
      }
    } catch (error) {
      console.error('Login error:', error);
      showError(error.message || 'Login failed. Please try again.');
    }
  });
});

// Helper functions
function showError(message) {
  const errorElement = document.getElementById('error-message');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    errorElement.style.color = '#ff4444';
  }
}

function showMessage(message, type = 'info') {
  const messageElement = document.getElementById('error-message');
  if (messageElement) {
    messageElement.textContent = message;
    messageElement.style.display = 'block';
    messageElement.style.color = type === 'success' ? '#4CAF50' : '#2196F3';
  }
}
