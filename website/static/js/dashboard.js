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

// --------------------- Get reference values -----------------------------
let sensorChart = null;                               // Chart instance reference
let updateInterval = null;                            // Real-time update interval reference

// Function to update chart data in real-time
async function updateChartData(chart, dataType) {
  try {
    const newData = await getDataSet(window.currentUser.uid, dataType);

    // Update the chart's data
    chart.data.datasets[0].data = newData;

    // Update the chart to reflect new data
    chart.update('none'); // 'none' prevents animation for smoother real-time updates
    updateDashboardSummary(dataType, chart.data.datasets[0].data);
  } catch (error) {
    console.error('Error updating chart data:', error);
  }
}

// Function to start real-time updates
function startRealTimeUpdates(dataType) {
  // Clear any existing interval
  if (updateInterval) {
    clearInterval(updateInterval);
  }

  // Update every 0.5 seconds (adjust as needed)
  updateInterval = setInterval(() => {
    if (sensorChart && window.currentUser) {
      updateChartData(sensorChart, dataType);
    }
  }, 500);
}

// Function to stop real-time updates
function stopRealTimeUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

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
      // console.log(snapshot.val());

      snapshot.forEach(child => {
        // console.log(child.key, child.val());
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

function formatTimestamp(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildAlerts(messages) {
  const alertList = document.getElementById('alertList');
  alertList.innerHTML = '';

  if (!messages.length) {
    alertList.innerHTML = '<li class="list-group-item alert-item">No active alerts. Your wrist is in a safe position.</li>';
    return;
  }

  messages.forEach(message => {
    const li = document.createElement('li');
    li.className = 'list-group-item alert-item';
    li.textContent = message;
    alertList.appendChild(li);
  });
}

function calculateRiskAndSummary(dataType, data) {
  const summary = {
    riskLabel: 'Good',
    riskClass: 'metric-value-good',
    highRiskMinutes: 0,
    alertCount: 0,
    neutralPercent: 100,
    exposurePercent: 0,
    breakRecommendation: 'Every 30 min',
    alerts: []
  };

  if (!data || !data.length) {
    summary.riskLabel = 'Waiting for data';
    summary.riskClass = 'metric-value-neutral';
    summary.breakRecommendation = 'Waiting for first sensor values';
    summary.alerts = [];
    return summary;
  }

  const latest = data[data.length - 1].y;
  let warningLabel = 'Good';
  let warningClass = 'metric-value-good';

  if (dataType === 'bend') {
    if (latest > 65) {
      warningLabel = 'High';
      warningClass = 'metric-value-critical';
      summary.alerts.push('Wrist bend is high. Straighten your wrist and take a break.');
    } else if (latest > 45) {
      warningLabel = 'Caution';
      warningClass = 'metric-value-warning';
      summary.alerts.push('Your wrist is moderately bent. Adjust posture.');
    }
  } else if (dataType === 'emg') {
    if (latest > 1.0) {
      warningLabel = 'High';
      warningClass = 'metric-value-critical';
      summary.alerts.push('Muscle activity is elevated. Relax your grip.');
    } else if (latest > 0.8) {
      warningLabel = 'Caution';
      warningClass = 'metric-value-warning';
      summary.alerts.push('EMG is above normal. Reduce tension.');
    }
  } else if (dataType === 'imu') {
    if (Math.abs(latest) > 55) {
      warningLabel = 'High';
      warningClass = 'metric-value-critical';
      summary.alerts.push('Wrist angle is extreme. Return to neutral position.');
    } else if (Math.abs(latest) > 35) {
      warningLabel = 'Caution';
      warningClass = 'metric-value-warning';
      summary.alerts.push('Wrist angle is out of neutral range. Correct posture.');
    }
  }

  summary.riskLabel = warningLabel;
  summary.riskClass = warningClass;

  const highRiskSamples = data.filter(point => {
    if (dataType === 'bend') return point.y > 45;
    if (dataType === 'emg') return point.y > 0.8;
    if (dataType === 'imu') return Math.abs(point.y) > 35;
    return false;
  }).length;

  summary.highRiskMinutes = Math.round(highRiskSamples * 0.5);
  summary.alertCount = summary.alerts.length;
  summary.neutralPercent = Math.round(((data.length - highRiskSamples) / data.length) * 100);
  summary.exposurePercent = Math.round((highRiskSamples / data.length) * 100);

  if (summary.alertCount === 0) {
    summary.alerts.push('No active alerts. Keep your wrist in a neutral position.');
  }

  if (summary.riskLabel === 'High') {
    summary.breakRecommendation = 'Stop and stretch now';
  } else if (summary.riskLabel === 'Caution') {
    summary.breakRecommendation = 'Take a short break soon';
  } else {
    summary.breakRecommendation = 'Keep monitoring posture';
  }

  return summary;
}

function updateDashboardSummary(dataType, data) {
  const summary = calculateRiskAndSummary(dataType, data);
  const riskLevel = document.getElementById('riskLevel');
  const highRiskMinutes = document.getElementById('highRiskMinutes');
  const alertCount = document.getElementById('alertCount');
  const lastUpdate = document.getElementById('lastUpdate');
  const neutralTime = document.getElementById('neutralTime');
  const motionExposure = document.getElementById('motionExposure');
  const breakRecommendation = document.getElementById('breakRecommendation');

  riskLevel.textContent = summary.riskLabel;
  riskLevel.className = `metric-value ${summary.riskClass}`;
  highRiskMinutes.textContent = `${summary.highRiskMinutes} min`;
  alertCount.textContent = summary.alertCount;
  lastUpdate.textContent = formatTimestamp(new Date());
  neutralTime.textContent = `${Math.round((summary.neutralPercent / 100) * 60)} min`;
  motionExposure.textContent = `${summary.exposurePercent}%`;
  breakRecommendation.textContent = summary.breakRecommendation;
  buildAlerts(summary.alerts);
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
        fill:     true,           // Fill area under the linechart
        backgroundColor:  'rgba(255, 107, 169, 0.1)',    // Gradient fill color
        borderColor:      'rgba(255, 107, 169, 0.8)',    // Line color
        borderWidth:      2.5,   // Line width
        pointRadius:      3,
        pointBackgroundColor: 'rgba(255, 107, 169, 1)',
        pointBorderColor: '#111827',
        pointBorderWidth: 1,
        pointHoverRadius: 5,
        tension: 0.4
      }
    );
  } else if (dataType == "emg") {
    datasets.push(
      {
        label:    `EMG (mV)`,     // Dataset label for legend
        data,
        fill:     true,           // Fill area under the linechart
        backgroundColor:  'rgba(122, 167, 255, 0.1)',    // Gradient fill color
        borderColor:      'rgba(122, 167, 255, 0.85)',   // Line color
        borderWidth:      2.5,   // Line width
        pointRadius:      3,
        pointBackgroundColor: 'rgba(122, 167, 255, 1)',
        pointBorderColor: '#111827',
        pointBorderWidth: 1,
        pointHoverRadius: 5,
        tension: 0.4
      }
    );
  } else if (dataType == "imu") {
    datasets.push(
      {
        label:    `IMU (°)`,     // Dataset label for legend
        data,
        fill:     true,           // Fill area under the linechart
        backgroundColor:  'rgba(251, 191, 36, 0.1)',    // Gradient fill color
        borderColor:      'rgba(251, 191, 36, 0.85)',   // Line color
        borderWidth:      2.5,   // Line width
        pointRadius:      3,
        pointBackgroundColor: 'rgba(251, 191, 36, 1)',
        pointBorderColor: '#111827',
        pointBorderWidth: 1,
        pointHoverRadius: 5,
        tension: 0.4
      }
    );
  }

  const lineChart = document.getElementById(id);

  const chart = new Chart(lineChart, {  // Construct the chart    
    type: 'line',
    data: {                         // Define data
      datasets
    },
    options: {                        // Define display chart display options 
      responsive: true,             // Re-size based on screen size
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0
        }
      },
      scales: {                     // Display options for x & y axes
        x: {                      // x-axis properties
          type: 'linear',
          title: {
            display: true,
            text: 'Time',     // x-axis title
            font: {                   // font properties
              size: 14,
              weight: '600'
            },
            color: '#9ba6c1'
          },
          ticks: {                      // x-axis tick mark properties
            callback: function(val, index, ticks){
              return String(val);
            },
            stepSize: 5,
            font: {
              size: 12
            },
            color: '#9ba6c1'
          },
          grid: {                       // x-axis grid properties
            color: 'rgba(255, 255, 255, 0.08)',
            drawBorder: true,
            borderColor: 'rgba(255, 255, 255, 0.15)'
          }
        },
        y: {                              // y-axis properties
          title: {
            display: true,                          
            text: `Sensor Value`,     // y-axis title
            font: {
              size: 14,
              weight: '600'
            },
            color: '#9ba6c1'
          },
          ticks: {
            min: 0,                   
            maxTicksLimit: 20,        
            font: {
              size: 11
            },
            color: '#9ba6c1'
          },
          grid: {                       // y-axis gridlines
            color: 'rgba(255, 255, 255, 0.08)',
            drawBorder: true,
            borderColor: 'rgba(255, 255, 255, 0.15)'
          }
        }
      },
      plugins: {                  // Display options for title and legend
        title: {
            display: true,
            text: 'Sensor Value Over Time',
            font: {
              size: 18,
              weight: '600'
            },
            color: '#ffffff',
            padding: {
              top: 0,
              bottom: 20
            }
        },
        legend: {
          align: 'center',
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: {
              size: 12
            },
            color: '#9ba6c1',
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          titleFont: {
            size: 12,
            weight: '600'
          },
          bodyFont: {
            size: 11
          },
          titleColor: '#ffffff',
          bodyColor: '#9ba6c1',
          padding: 12,
          displayColors: true,
          cornerRadius: 8,
          callbacks: {
            title: function(context){
              return 'Time: ' + String(context[0].label).replace(/,/g, '');
            },
            label: function(context) {
              return 'Value: ' + context.parsed.y.toFixed(2);
            }
          }
        }
      }
    }
  });

  updateDashboardSummary(dataType, data);
  return chart;
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
    // Start real-time updates for the initial chart
    startRealTimeUpdates('bend');
  });

  // Create a new chart with the selected data type when the dropdown value changes
  document.getElementById('dataType').addEventListener('change', (event) => {
    const dataType = event.target.value;

    if (sensorChart && typeof sensorChart.destroy === 'function') {
      sensorChart.destroy(); // Destroy current chart before creating new one
    }

    createChart(dataType, 'sensorGraph').then(chart => {
      sensorChart = chart;
      // Start real-time updates for the new data type
      startRealTimeUpdates(dataType);
    });
  });

  // Delete a single day's data function call
  document.getElementById('delete').addEventListener('click', async function() {
    if (confirm("Are you sure you want to reset the graph? This will delete all your data for this sensor.")) {
      const dataType = document.getElementById('dataType').value;
      const userID = window.currentUser.uid;

      // Stop real-time updates while deleting
      stopRealTimeUpdates();

      await deleteDataSet(userID, dataType);

      if (sensorChart && typeof sensorChart.destroy === 'function') {
        sensorChart.destroy(); // Destroy current chart before creating new one
      }

      createChart(document.getElementById('dataType').value, 'sensorGraph').then(chart => {
        sensorChart = chart;
        // Restart real-time updates after recreating chart
        startRealTimeUpdates(dataType);
      });
    }
  });

  // Stop real-time updates when page unloads (user navigates away or logs out)
  window.addEventListener('beforeunload', () => {
    stopRealTimeUpdates();
  });
});