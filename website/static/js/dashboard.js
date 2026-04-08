// ----------------- Page Loaded After User Sign-in -------------------------//
// ----------------- Firebase Setup & Initialization ------------------------//

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword }
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
let sensorChart = null;                               // Chart instance reference

// ------------------------Set (insert) data into FRD ------------------------
// function setData(userID, dataType, index, value) {
//   // Must use brackets around variable names to use it as a key
//   set(ref(db, 'users/' + userID + '/data/' + dataType + '/' + index), {
//     [index]: value
//   })
//   .then(() => {
//     alert("Data stored successfully.");
//   })
//   .catch((error) => {
//     alert("There was an error. Error: " + error);
//   });
// }

// -------------------------Update data in database --------------------------
// function updateData(userID, dataType, index, value) {
//   // Must use brackets around variable names to use it as a key
//   update(ref(db, 'users/' + userID + '/data/' + dataType + '/' + index), {
//     [index]: value
//   })
//   .then(() => {
//     alert("Data stored successfully.");
//   })
//   .catch((error) => {
//     alert("There was an error. Error: " + error);
//   });
// }

// ----------------------Get a datum from FRD (single data point)---------------
// function getData(userID, dataType, index) {
//   let dataTypeVal = document.getElementById('dataTypeVal');
//   let indexVal = document.getElementById('indexVal');
//   let sensorVal = document.getElementById('sensorVal');

//   const dbref = ref(db); // Firebase parameter for getting data

//   // Provide the path through the nodes to the data
//   get(child(dbref, 'users/' + userID + '/data/' + dataType + '/' + index))
//     .then((snapshot) => {
//       if (snapshot.exists()) {
//         dataTypeVal.textContent = dataType;
//         indexVal.textContent = index;
        
//         // To get specific value from the provided key: snapshot.val()[key]
//         sensorVal.textContent = snapshot.val()[index];
//       } else {
//         alert('No data found.');
//       }
//     })
//     .catch((error) => {
//       alert('Unsuccessful, error: ' + error);
//     });
// }

// ---------------------------Get a data set --------------------------
// Must be an async function because you need to get all the data from FRD
// before you can process it for a table or graph
async function getDataSet(userID, dataType) {
  const indexes = [];
  const values = [];

  const dbref = ref(db); // Firebase parameter to access database

  // Wait for all data to be pulled from FRD
  // Must provide the path through the nodes
  await get(child(dbref, 'users/' + userID + '/data/' + dataType)).then((snapshot) => {
    if (snapshot.exists()) {
      console.log(snapshot.val());

      snapshot.forEach(child => {
        console.log(child.key, child.val());
        // Push values to the corresponding arrays
        indexes.push(child.key);
        values.push(child.val());
      });
    } else {
      // alert('No data found');
    }
  })
  .catch((error) => {
    alert('Unsuccessful, error: ' + error);
  });

  return indexes.map((index, i) => ({ x: index, y: values[i] })); // Return array of objects with x and y values for graphing
}

// Add a item to the table of data
// function addItemToTable(day, temp, tbody) {
//   console.log(day, temp);
//   let tRow = document.createElement("tr");
//   let td1 = document.createElement("td");
//   let td2 = document.createElement("td");

//   td1.innerHTML = day;
//   td2.innerHTML = temp;

//   tRow.appendChild(td1);
//   tRow.appendChild(td2);

//   tbody.appendChild(tRow);
// }

// Function that creates a chart from sensor data
async function createChart(dataType, id){
  let data;
  if (["bend", "emg", "imu"].includes(dataType)) {
    data = await getDataSet(window.currentUser.uid, dataType);
  }

  let datasets = [];

  if (dataType == "bend") {
    datasets.push(
      {
        label:    `Bend %`,     // Dataset label for legend
        data,
        fill:     false,           // Fill area under the linechart (true = yes, false = no)
        backgroundColor:  'rgba(255, 0, 132, 0.2)',    // Color for data marker
        borderColor:      'rgba(255, 0, 132, 1)',      // Color for data marker border
        borderWidth:      1   // Data marker border width
      }
    );
  } else if (dataType == "emg") {
    datasets.push(
      {
        label:    `EMG (mV)`,     // Dataset label for legend
        data,
        fill:     false,           // Fill area under the linechart (true = yes, false = no)
        backgroundColor:  'rgba(54, 162, 235, 0.2)',    // Color for data marker
        borderColor:      'rgba(54, 162, 235, 1)',      // Color for data marker border
        borderWidth:      1   // Data marker border width
      }
    );
  } else if (dataType == "imu") {
    datasets.push(
      {
        label:    `IMU (°)`,     // Dataset label for legend
        data,
        fill:     false,           // Fill area under the linechart (true = yes, false = no)
        backgroundColor:  'rgba(255, 206, 86, 0.2)',    // Color for data marker
        borderColor:      'rgba(255, 206, 86, 1)',      // Color for data marker border
        borderWidth:      1   // Data marker border width
      }
    );
  }

  const lineChart = document.getElementById(id);

  return new Chart(lineChart, {  // Construct the chart    
    type: 'line',
    data: {                         // Define data
      datasets
    },
    options: {                        // Define display chart display options 
      responsive: true,             // Re-size based on screen size
      maintainAspectRatio: true,
      scales: {                     // Display options for x & y axes
        x: {                      // x-axis properties
          type: 'linear',
          title: {
            display: true,
            text: 'Time',     // x-axis title
            font: {                   // font properties
              size: 14
            },
          },
          ticks: {                      // x-axis tick mark properties
            callback: function(val, index, ticks){
              return String(val);
            },
            stepSize: 5,
            font: {
              size: 14  
            },
          },
          grid: {                       // x-axis grid properties
            color: '#6c767e'
          }
        },
        y: {                              // y-axis properties
          title: {
            display: true,                          
            text: `Sensor Value`,     // y-axis title
            font: {
              size: 14
            },
          },
          ticks: {
            // callback: function(value, index, ticks) {
            //   return new Intl.NumberFormat('en-US', {
            //     notation: 'compact',
            //     maximumFractionDigits: 1
            //   }).format(value);
            // },
            min: 0,                   
            maxTicksLimit: 20,        
            font: {
              size: 12
            }
          },
          grid: {                       // y-axis gridlines
            color: '#6c767e'
          }
        }
      },
      plugins: {                  // Display options for title and legend
        title: {
            display: true,
            text: 'Sensor Value Over Time',
            font: {
              size: 24,
            },
            color: '#black',
            padding: {
              top: 10,
              bottom: 30
            }
        },
        legend: {
          align: 'start',
          position: 'bottom',
        },
        tooltip: {
          callbacks: {
            title: function(context){
              return String(context[0].label).replace(/,/g, ''); // Remove commas from x value
            } 
          }
        }
      }
    }
  });
}

// // -------------------------Delete a data point from FRD ---------------------
// function deleteData(userID, dataType, index) {
//   remove(ref(db, 'users/' + userID + '/data/' + dataType + '/' + index))
//   .then(() => {
//     alert('Data removed successfully');
//   })
//   .catch((error) => {
//     alert('Unsuccessful, error: ' + error);
//   });
// }

// -------------------------Delete a dataset from FRD ---------------------
async function deleteDataSet(userID, dataType) {
  await remove(ref(db, 'users/' + userID + '/data/' + dataType))
  .then(() => {
    alert('Data removed successfully');
  })
  .catch((error) => {
    alert('Unsuccessful, error: ' + error);
  });
}

// --------------------------- Home Page Loading -----------------------------
window.addEventListener('DOMContentLoaded', function() {
  if (!window.currentUser) {
    const storedUser = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || 'null');
    if (storedUser) {
      window.currentUser = storedUser;
    }
  }

  if (!window.currentUser) {
    alert("No user is currently signed in. Redirecting to sign in page.");
    window.location = "/signIn";
  }

  createChart('bend', 'sensorGraph').then(chart => {
    sensorChart = chart;
  });

  // Create a new chart with the selected data type when the dropdown value changes
  document.getElementById('dataType').addEventListener('change', (event) => {
    const dataType = event.target.value;

    if (sensorChart && typeof sensorChart.destroy === 'function') {
      sensorChart.destroy(); // Destroy current chart before creating new one
    }

    createChart(dataType, 'sensorGraph').then(chart => {
      sensorChart = chart;
    });
  });

  // Delete a single day's data function call
  document.getElementById('delete').addEventListener('click', async function() {
    if (confirm("Are you sure you want to reset the graph? This will delete all your data for this sensor.")) {
      const dataType = document.getElementById('dataType').value;
      const userID = window.currentUser.uid;

      await deleteDataSet(userID, dataType);

      if (sensorChart && typeof sensorChart.destroy === 'function') {
        sensorChart.destroy(); // Destroy current chart before creating new one
      }

      createChart(document.getElementById('dataType').value, 'sensorGraph').then(chart => {
        sensorChart = chart;
      });
    }
  });
});