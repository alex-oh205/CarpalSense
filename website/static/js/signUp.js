/**
 * Project Name: CarpalSense
 * Team Members: Shiv Patel, Kanata Sasaki, Alex Oh, Arjun ArunPrasad
 * Date: 5/27/2026
 * Description: Handles user sign-up/account creation functionality and validation.
 */

// ----------------- Firebase Setup & Initialization ------------------------//
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import { getDatabase, ref, set, update, child, get }
  from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js"

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

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

// Return instance of your app's Firebase Realtime Database (FRD)
const db = getDatabase();

// ---------------- Register New User --------------------------------//

const form = document.querySelector('.needs-validation');
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const emailInput = document.getElementById('userEmail');

const nameRegex = /^[A-Za-z](?:[A-Za-z' -]*[A-Za-z])?$/;
const usernameRegex = /^[A-Za-z0-9]{4,20}$/;
const emailRegex = /^[a-zA-Z0-9._%+-]+@ctemc\.org$/;

form.addEventListener('submit', (event) => {
  event.preventDefault();
  event.stopPropagation();
  form.classList.add('was-validated');

  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const email = emailInput.value.trim();
  const password = document.getElementById('userPass').value;

  firstNameInput.value = firstName;
  lastNameInput.value = lastName;

  let valid = true;

  if (!nameRegex.test(firstName)) {
    firstNameInput.setCustomValidity('Invalid first name');
    valid = false;
  } else {
    firstNameInput.setCustomValidity('');
  }

  if (!nameRegex.test(lastName)) {
    lastNameInput.setCustomValidity('Invalid last name');
    valid = false;
  } else {
    lastNameInput.setCustomValidity('');
  }

  if (!emailRegex.test(email)) {
    emailInput.setCustomValidity('Invalid email address');
    valid = false;
  } else {
    emailInput.setCustomValidity('');
  }

  if (!form.checkValidity() || !valid) {
    return;
  }

  createUserWithEmailAndPassword(auth, email, password)
  .then((userCredential) => {
    const user = userCredential.user;
    set(ref(db, 'users/' + user.uid + '/accountInfo'), {
      uid: user.uid,
      email: email,
      firstname: firstName,
      lastname: lastName
    })
    .then(async () => {
      // alert('User created successfully!');

      // Get the ID token and add to firebase configuration
      // User ID token is used by the Flask server to let Firebase know that it has
      // permission to read/write data to the current user's account.
      const idToken = await user.getIdToken(/* forceRefresh */ true);
      const backendConfig = {
        ...firebaseConfig,
        idToken,
        currentUser: user.uid  // Keep uid for Firebase operations
      };

      // Log sign-in date in the database
      // 'update' will only add the last_login info and won't overwrite everything
      let logDate = new Date();
      await update(ref(db, 'users/' + user.uid + '/accountInfo'), {
        last_login: logDate,
      });

      // alert('User signed in successfully!');

      // Get snapshot of all the user information that will be passed
      // to the login() function and stored in either session or local storage
      // snapshot - copy of a system's state at a specific point in time
      const snapshot = await get(ref(db, 'users/' + user.uid + '/accountInfo'));
      if (snapshot.exists()) {
        console.log(snapshot.val());
        let userData = snapshot.val();
        userData.uid = user.uid; // Add the Firebase user ID to the user data
        logIn(userData, backendConfig);
      } else {
        alert('User does not exist');
      }
    });
  })
  .catch((error) => {
    const errorMessage = error.message;
    alert(errorMessage);
  });
});

async function logIn(user, fbcfg) {
  sessionStorage.setItem('user', JSON.stringify(user))

  // Send Firebase config and user ID to app.py using POST
  const payload = { ...fbcfg, currentUser: user };
  try {
    const response = await fetch('/data', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Failed to send login info to server:', await response.text());
      return;
    }
  } catch (error) {
    console.error('Error sending login info to server:', error);
    return;
  }

  window.location = "/dashboard";       // Redirect browser to dashboard.html
}