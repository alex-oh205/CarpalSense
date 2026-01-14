// Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
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