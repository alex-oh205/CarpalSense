// ----------------- User Sign-In Page --------------------------------------//

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

// ---------------------- Sign-In User ---------------------------------------//

document.getElementById('signIn').onclick = function() {

    // Get user's email and password for signing in
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    console.log(email, password);

    // Attempt to sign in the user
    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            // Create user credential and store the user ID
            const user = userCredential.user;

            // Get the ID token and add to firebase configuration
            // User ID token is used by the Flask server to let Firebase know that it has
            //   permission to read/write data to the current user's account.
            user.getIdToken(/* forceRefresh */ true).then((idToken) => {
                // console.log("ID Token:", idToken);
                // Update the Firebase configuration so that it can be sent to the Flask server
                firebaseConfig.idToken = idToken;
                firebaseConfig.userID = user.uid;
            }).catch((error) => {
                // Handle error getting token
                console.log("Error getting ID token:", error);
            });
            
            // Log sign-in date in the database
            // 'update' will only add the last_login info and won't overwrite everything
            let logDate = new Date();
            update(ref(db, 'users/' + user.uid + '/accountInfo'), {
                last_login: logDate,
            })
            .then(() => {
                // User signed in successfully
                alert('User signed in successfully!');

                // Get snapshot of all the user information that will be passed
                // to the login() function and stored in either session or local storage
                // snapshot - copy of a system's state at a specific point in time
                get(ref(db, 'users/' + user.uid + '/accountInfo')).then((snapshot) => {
                    if (snapshot.exists()) {
                        console.log(snapshot.val());
                        logIn(snapshot.val(), firebaseConfig);
                    } else {
                        console.log('User does not exist');
                    }
                })
                .catch((error) => {
                    console.log(error);
                });
            })
            .catch((error) => {
                console.log(error);
            })
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.log(errorMessage);
        });
}

// ---------------- Keep User Logged In ----------------------------------//
function logIn(user, fbcfg) {
    let keepLoggedIn = document.getElementById('keepLoggedInSwitch').ariaChecked;

    // Session storage is temporary (only while browser session is active)
    // Information saved as string (must convert JS object to string)
    // Session storage will be cleared with a signOut() function in dashboard.js
    if (!keepLoggedIn) {
        sessionStorage.setItem('user', JSON.stringify(user))
    }

    // Local storage is permanent (keep user logged in even if browser is closed)
    // Local storage will be cleared with signOut() function in dashboard.js
    else {
        localStorage.setItem('keepLoggedIn', 'yes');
        localStorage.setItem('user', JSON.stringify(user));
    }

    // Send Firebase config. and userID to app.py using POST
    fetch('/test', {
        "method": "POST",
        "headers": {"Content-Type": "application/json"},
        "body": JSON.stringify(fbcfg)
    });

    // alert(fbcfg)                 // For debug only
    window.location = "dashboard";       // Redirect browser to dashboard.html
}