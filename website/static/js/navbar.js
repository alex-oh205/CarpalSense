// ----------------- Navbar User State Management ------------------------//

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBwYFwrTIe5W3bVJiGXyl5pcDkEDOESVww",
  authDomain: "carpal-sense.firebaseapp.com",
  databaseURL: "https://carpal-sense-default-rtdb.firebaseio.com",
  projectId: "carpal-sense",
  storageBucket: "carpal-sense.firebasestorage.app",
  messagingSenderId: "983351019977",
  appId: "1:983351019977:web:3d158394b70cd69c49c018"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
const auth = getAuth();

// Function to send Firebase config to server when user is logged in
async function sendConfigToServer() {
  const keepLoggedIn = localStorage.getItem("keepLoggedIn");
  let userData = null;

  if (keepLoggedIn == "yes") {
    userData = JSON.parse(localStorage.getItem('user'));
  } else {
    userData = JSON.parse(sessionStorage.getItem('user'));
  }

  if (userData) {
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;

      const idToken = await firebaseUser.getIdToken(true);
      
      const payload = {
        ...firebaseConfig,
        currentUser: userData,
        idToken: idToken
      };
      
      const response = await fetch('/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error('Failed to send config to server:', await response.text());
      }

      if (!document.getElementById('profile')) {
        // If user is logged in but profile button doesn't exist, reload
        location.reload();
      }
    } catch (error) {
      console.error('Error sending config to server:', error);
    }
  }
}

// Send config when Firebase auth state changes
onAuthStateChanged(auth, (firebaseUser) => {
  if (firebaseUser) {
    sendConfigToServer();
  }
});

// Sign-out function that will remove user info from local/session storage and
// sign-out from FRD
document.addEventListener('DOMContentLoaded', function() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', async function(e) {
      e.preventDefault();
      
      // Sign out from Firebase
      try {
        await signOut(auth);
      } catch (error) {
        console.error('Firebase sign out error:', error);
      }
      
      // Clear client-side storage
      sessionStorage.removeItem('user');
      localStorage.removeItem('user');
      localStorage.removeItem('keepLoggedIn');
      
      // Redirect to server logout route
      window.location = '/logout';
    });
  }
});

window.addEventListener('scroll', function(event) {
  const navbar = document.getElementById('navbar');
  if (window.scrollY > 20) {
    navbar.classList.add('background-color-dark');
    navbar.classList.add('navbar-shadow');
    navbar.classList.remove('background-transparent');
  } else {
    navbar.classList.add('background-transparent');
    navbar.classList.remove('background-color-dark');
    navbar.classList.remove('navbar-shadow');
  }
});