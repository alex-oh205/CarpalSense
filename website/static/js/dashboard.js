// ----------------- Page Loaded After User Sign-in -------------------------//
// ----------------- Firebase Setup & Initialization ------------------------//

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import { getDatabase, ref, set, update, child, get, remove }
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


// ---------------------// Get reference values -----------------------------

let userLink = document.getElementById('userLink');   // Username for na
let signOutLink = document.getElementById('signOut'); // Sign out link
let welcome = document.getElementById('welcome');     // Welcome header
let currentUser = null; // Initialize currentUser to null

// ----------------------- Get User's Name'Name ------------------------------

function getUsername() {
  // Grab value for the 'keep logged in' switch
  let keepLoggedIn = localStorage.getItem("keepLoggedIn");

  // Grab user information passed from signIn.js
  if (keepLoggedIn == "yes") {
    currentUser = JSON.parse(localStorage.getItem('user'));
  } else {
    currentUser = JSON.parse(sessionStorage.getItem('user'));
  }
}

// Sign-out function that will remove user info from local/session storage and
// sign-out from FRD
function signOutUser() {
  sessionStorage.removeItem('user');  // Clear session storage
  localStorage.removeItem('user');    // Clear local storage
  localStorage.removeItem('keepLoggedIn');

  signOut(auth).then(() => {
    // Sign out successful
  }).catch((error) => {
    // Error occured
  });

  window.location = "signIn";
}


// ------------------------Set (insert) data into FRD ------------------------
function setData(userID, year, month, day, temperature) {
  // Must use brackets around variable names to use it as a key
  set(ref(db, 'users/' + userID + '/data/' + year + '/' + month), {
    [day]: temperature
  })
  .then(() => {
    alert("Data stored successfully.");
  })
  .catch((error) => {
    alert("There was an error. Error: " + error);
  });
}

// -------------------------Update data in database --------------------------
function updateData(userID, year, month, day, temperature) {
  // Must use brackets around variable names to use it as a key
  update(ref(db, 'users/' + userID + '/data/' + year + '/' + month), {
    [day]: temperature
  })
  .then(() => {
    alert("Data stored successfully.");
  })
  .catch((error) => {
    alert("There was an error. Error: " + error);
  });
}

// ----------------------Get a datum from FRD (single data point)---------------
function getData(userID, year, month, day) {
  let yearVal = document.getElementById('yearVal');
  let monthVal = document.getElementById('monthVal');
  let dayVal = document.getElementById('dayVal');
  let tempVal = document.getElementById('tempVal');

  const dbref = ref(db); // Firebase parameter for getting data

  // Provide the path through the nodes to the data
  get(child(dbref, 'users/' + userID + '/data/' + year + '/' + month))
    .then((snapshot) => {
      if (snapshot.exists()) {
        yearVal.textContent = year;
        monthVal.textContent = month;
        dayVal.textContent = day;
        
        // To get specific value from the provided key: snapshot.val()[key]
        tempVal.textContent = snapshot.val()[day];
      } else {
        alert('No data found.');
      }
    })
    .catch((error) => {
      alert('Unsuccessful, error: ' + error);
    });
}

// ---------------------------Get a month's data set --------------------------
// Must be an async function because you need to get all the data from FRD
// before you can process it for a table or graph
async function getDataSet(userID, year, month) {
  let yearVal = document.getElementById('setYearVal');
  let monthVal = document.getElementById('setMonthVal');

  yearVal.textContent = `Year: ${year}`;
  monthVal.textContent = `Month: ${month}`;

  const days = [];
  const temps = [];
  const tbodyEl = document.getElementById('tbody-2'); // Select <tbody> element

  const dbref = ref(db); // Firebase parameter to access database

  // Wait for all data to be pulled from FRD
  // Must provide the path through the nodes
  await get(child(dbref, 'users/' + userID + '/data/' + year + '/' + month)).then((snapshot) => {
    if (snapshot.exists()) {
      console.log(snapshot.val());

      snapshot.forEach(child => {
        console.log(child.key, child.val());
        // Push values to the corresponding arrays
        days.push(child.key);
        temps.push(child.val());
      });
    } else {
      alert('No data found');
    }
  })
  .catch((error) => {
    alert('Unsuccessful, error: ' + error);
  });

  // Dynamically add table rows to HTML using string interpolation
  tbodyEl.innerHTML = '';  // Clear any existing table
  for (let i = 0; i < days.length; i++) {
    addItemToTable(days[i], temps[i], tbodyEl);
  }
}

// Add a item to the table of data
function addItemToTable(day, temp, tbody) {
  console.log(day, temp);
  let tRow = document.createElement("tr");
  let td1 = document.createElement("td");
  let td2 = document.createElement("td");

  td1.innerHTML = day;
  td2.innerHTML = temp;

  tRow.appendChild(td1);
  tRow.appendChild(td2);

  tbody.appendChild(tRow);
}

// -------------------------Delete a day's data from FRD ---------------------
function deleteData(userID, year, month, day) {
  remove(ref(db, 'users/' + userID + '/data/' + year + '/' + month + '/' + day))
  .then(() => {
    alert('Data removed successfully');
  })
  .catch((error) => {
    alert('Unsuccessful, error: ' + error);
  });
}


// --------------------------- Home Page Loading -----------------------------
window.onload = function() {
  // ------------------------- Set Welcome Message -------------------------
  getUsername();  // Get current user's first name
  if (currentUser == null) {
    userLink.innerText = "Create New Account";
    userLink.classList.replace("nav-link", "btn");
    userLink.classList.add("btn-primary");
    userLink.href = "{{ url_for('signUp') }}";

    signOutLink.innerText = "Sign In";
    signOutLink.classList.replace("nav-link", "btn");
    signOutLink.classList.add("btn-success");
    signOutLink.href = "{{ url_for('signIn') }}";
  } else {
    userLink.innerText = currentUser.firstname;
    welcome.innerText = "Welcome " + currentUser.firstname;
    userLink.classList.replace("btn", "nav-link");
    userLink.classList.add("btn-primary");
    userLink.href = "#";

    signOutLink.innerText = "Sign Out";
    signOutLink.classList.replace("btn", "nav-link");
    signOutLink.classList.add("btn-success");
    document.getElementById('signOut').onclick = function() {
      signOutUser();
    }
  }
  
  // Get, Set, Update, Delete Sharkriver Temp. Data in FRD
  // Set (Insert) data function call
  document.getElementById('set').onclick = function() {
    const year = document.getElementById('year').value;
    const month = document.getElementById('month').value;
    const day = document.getElementById('day').value;
    const temperature = document.getElementById('temperature').value;
    const userID = currentUser.uid;

    setData(userID, year, month, day, temperature);
  }

  // Update data function call
  document.getElementById('update').onclick = function() {
    const year = document.getElementById('year').value;
    const month = document.getElementById('month').value;
    const day = document.getElementById('day').value;
    const temperature = document.getElementById('temperature').value;
    const userID = currentUser.uid;

    updateData(userID, year, month, day, temperature);
  }

  // Get a datum function call
  document.getElementById('get').onclick = function() {
    const year = document.getElementById('getYear').value;
    const month = document.getElementById('getMonth').value;
    const day = document.getElementById('getDay').value;
    const userID = currentUser.uid;

    getData(userID, year, month, day);
  }

  // Get a data set function call
  document.getElementById('getDataSet').onclick = function() {
    const year = document.getElementById('getSetYear').value;
    const month = document.getElementById('getSetMonth').value;
    const userID = currentUser.uid;

    getDataSet(userID, year, month);
  }

  // Delete a single day's data function call
  document.getElementById('delete').onclick = function() {
    const year = document.getElementById('delYear').value;
    const month = document.getElementById('delMonth').value;
    const day = document.getElementById('delDay').value;
    const userID = currentUser.uid;

    deleteData(userID, year, month, day);
  }
}