// ----------------- Navbar User State Management ------------------------//

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

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

// --------------------- Get reference values -----------------------------//

let signInLink = document.getElementById('signInLink');   // Sign in link
let signUpLink = document.getElementById('signUpLink'); // Sign up link
let userDropdown = document.getElementById('userDropdown'); // User profile dropdown
window.currentUser = null; // Initialize currentUser globally

// ----------------------- Get User's Name ------------------------------//

function getUsername() {
  // Grab value for the 'keep logged in' switch
  let keepLoggedIn = localStorage.getItem("keepLoggedIn");

  // Grab user information passed from signIn.js
  if (keepLoggedIn == "yes") {
    window.currentUser = JSON.parse(localStorage.getItem('user'));
  } else {
    window.currentUser = JSON.parse(sessionStorage.getItem('user'));
  }
}

// Initialize currentUser immediately when script loads
getUsername();

// Sign-out function that will remove user info from local/session storage and
// sign-out from FRD
window.signOutUser = function() {
  // Clear client-side storage first
  sessionStorage.removeItem('user');
  localStorage.removeItem('user');
  localStorage.removeItem('keepLoggedIn');

  // Sign out from Firebase and then redirect
  signOut(auth).then(() => {
    // Firebase sign out successful, now redirect
    window.location = "/logout";
  }).catch((error) => {
    console.error('Firebase sign out error:', error);
    // Still redirect even if Firebase sign out fails
    window.location = "/logout";
  });
};

// --------------------------- Navbar Initialization -----------------------------//

function initNavbar() {
  if (window.currentUser == null) {
    if (signInLink) signInLink.hidden = false;
    if (signUpLink) signUpLink.hidden = false;
    if (userDropdown) userDropdown.hidden = true;
  } else {
    if (userDropdown) {
      document.getElementById('profileDropdown').textContent = window.currentUser.firstname;
      userDropdown.hidden = false;
    }
    if (signInLink) signInLink.hidden = true;
    if (signUpLink) signUpLink.hidden = true;
  }
}

// Run on page load
window.addEventListener('DOMContentLoaded', initNavbar);
