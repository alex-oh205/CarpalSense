// This JS file is for registering a new app user ---------------------------//

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
    .then(() => {
      alert('User created successfully!')
    });
  })
  .catch((error) => {
    const errorMessage = error.message;
    alert(errorMessage);
  });
});