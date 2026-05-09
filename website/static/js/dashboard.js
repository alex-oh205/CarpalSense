// ----------------- Page Loaded After User Sign-in -------------------------//
// ----------------- Firebase Setup & Initialization ------------------------//

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import { getDatabase, ref, set, update, child, get, remove, onValue }
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
let historyChart = null;                              // History chart instance reference
let updateInterval = null;                            // Real-time update interval reference
let dataType = 'bend';
let historyDataType = 'bend';
let isCollecting = false;
let sessionDataStarted = false;
let activeSessionId = null;                            // Currently recording session
let activeSessionName = '';
let selectedHistorySessionId = '';
let sessionDataCounts = { bend: 0, emg: 0, imu: 0 };

function updateCollectButtonState() {
  const collectBtn = document.getElementById('collectBtn');
  if (!collectBtn) return;
  if (isCollecting) {
    collectBtn.textContent = 'Pause';
    collectBtn.classList.remove('btn-outline-success');
    collectBtn.classList.add('btn-outline-warning');
  } else {
    collectBtn.textContent = 'Start';
    collectBtn.classList.remove('btn-outline-warning');
    collectBtn.classList.add('btn-outline-success');
  }
}

function updateSessionControls() {
  const collectBtn = document.getElementById('collectBtn');
  const newSessionBtn = document.getElementById('newSessionBtn');

  if (!collectBtn || !newSessionBtn) return;

  collectBtn.disabled = !activeSessionId;
  newSessionBtn.disabled = false;
  newSessionBtn.textContent = activeSessionId ? 'End Session' : 'New Session';
  
  if (activeSessionId) {
    updateCollectButtonState();
    newSessionBtn.classList.remove('btn-outline-info');
    newSessionBtn.classList.add('btn-outline-danger');
    newSessionBtn.setAttribute('data-bs-toggle', 'modal');
    newSessionBtn.setAttribute('data-bs-target', '#endSessionModal');
  } else {
    collectBtn.textContent = 'Start';
    collectBtn.classList.remove('btn-outline-warning');
    collectBtn.classList.add('btn-outline-success');
    newSessionBtn.classList.remove('btn-outline-danger');
    newSessionBtn.classList.add('btn-outline-info');
    newSessionBtn.removeAttribute('data-bs-toggle');
    newSessionBtn.removeAttribute('data-bs-target');
  }
}

function setCurrentSessionLabel(label) {
  const labelEl = document.getElementById('currentSessionLabel');
  if (!labelEl) return;
  labelEl.textContent = label || 'No active session';
}

function updateHistoryControls() {
  const deleteBtn = document.getElementById('deleteSessionBtn');
  deleteBtn.disabled = !selectedHistorySessionId;
}

async function getSessionSummary(userID, sessionId) {
  if (!sessionId) return null;
  const dbref = ref(db);
  const snapshot = await get(child(dbref, `users/${userID}/sessions/${sessionId}/summary`));
  return snapshot.exists() ? snapshot.val() : null;
}

function updateHistorySummary(summary) {
  const riskLevel = document.getElementById('historyRiskLevel');
  const highRiskMinutes = document.getElementById('historyHighRiskMinutes');
  const alertCount = document.getElementById('historyAlertCount');
  const neutralTime = document.getElementById('historyNeutralTime');
  const motionExposure = document.getElementById('historyMotionExposure');
  const breakRecommendation = document.getElementById('historyBreakRecommendation');

  if (!riskLevel || !highRiskMinutes || !alertCount || !neutralTime || !motionExposure || !breakRecommendation) return;

  if (!summary) {
    riskLevel.textContent = '--';
    highRiskMinutes.textContent = '--';
    alertCount.textContent = '--';
    neutralTime.textContent = '--';
    motionExposure.textContent = '--';
    breakRecommendation.textContent = '--';
    return;
  }

  riskLevel.textContent = summary.riskLabel || '--';
  highRiskMinutes.textContent = summary.highRiskMinutes != null ? `${summary.highRiskMinutes} min` : '--';
  alertCount.textContent = summary.alertCount != null ? summary.alertCount : '--';
  neutralTime.textContent = summary.neutralPercent != null ? `${Math.round((summary.neutralPercent / 100) * 60)} min` : '--';
  motionExposure.textContent = summary.exposurePercent != null ? `${summary.exposurePercent}%` : '--';
  breakRecommendation.textContent = summary.breakRecommendation || '--';
}

function setConnectionStatus(isConnected) {
  const status = document.getElementById('connectionStatus');
  status.textContent = isConnected ? 'Connected' : 'Disconnected';
  status.className = `badge rounded-pill status-badge ${isConnected ? 'status-good' : 'status-critical'}`;
}

function setDataActivityStatus(isActive) {
  const mode = document.getElementById('modeStatus');
  mode.textContent = isActive ? 'Active' : 'No updates';
  mode.className = `badge rounded-pill status-badge ${isActive ? 'status-good' : 'status-warning'}`;
}

async function setServerSessionId(sessionId) {
  try {
    await fetch('/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch (error) {
    console.error('Unable to register session with backend:', error);
  }
}

// Function to update chart data in real-time
async function updateChartData(chart, dataType) {
  try {
    setDataActivityStatus(true);
    const newData = await getDataSet(window.currentUser.uid, dataType);

    // Cache data count for session writes
    if (activeSessionId) {
      await syncSessionData(window.currentUser.uid, activeSessionId, dataType, newData);
    }

    // Update the chart's data
    chart.data.datasets[0].data = newData;

    // Update the chart to reflect new data
    chart.update('none'); // 'none' prevents animation for smoother real-time updates
    const summary = updateDashboardSummary(dataType, chart.data.datasets[0].data);
    if (activeSessionId) {
      await updateSessionSummary(window.currentUser.uid, activeSessionId, summary);
    }
  } catch (error) {
    console.error('Error updating chart data:', error);
    setDataActivityStatus(false);
  }
}

async function syncSessionData(userID, sessionId, dataType, data) {
  if (!data || !data.length || !sessionId) return;

  const currentCount = sessionDataCounts[dataType] || 0;
  if (data.length <= currentCount) return;

  const newPoints = data.slice(currentCount);
  const updates = {};
  newPoints.forEach(point => {
    const key = point.x;
    updates[`users/${userID}/sessions/${sessionId}/data/${dataType}/${key}`] = point.y;
  });

  try {
    await update(ref(db), updates);
    sessionDataCounts[dataType] = data.length;
  } catch (error) {
    console.error('Error writing session data:', error);
  }
}

// Function to start real-time updates
function startRealTimeUpdates(dataType) {
  isCollecting = true;
  if (sessionDataStarted) {
    fetch('/session-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collecting: true, reset: false })
    }).catch(error => {
      console.error('Unable to start session data collection on backend:', error);
    });
  } else {
    sessionDataStarted = true;
    fetch('/session-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collecting: true, reset: true })
    }).catch(error => {
      console.error('Unable to start session data collection on backend:', error);
    });
  }
  updateCollectButtonState();

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
  isCollecting = false;
  fetch('/session-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collecting: false, reset: false })
  }).catch(error => {
    console.error('Unable to stop session data collection on backend:', error);
  });
  updateCollectButtonState();
  setDataActivityStatus(false);
}

// ---------------------------Get a data set --------------------------
// Must be an async function because you need to get all the data from FRD
// before you can process it for a table or graph
async function getDataSet(userID, dataType) {
  const items = [];
  const dbref = ref(db); // Firebase parameter to access database

  await get(child(dbref, 'users/' + userID + '/data/' + dataType)).then((snapshot) => {
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const key = Number(child.key);
        if (!Number.isNaN(key)) {
          items.push({ index: key, value: child.val() });
        }
      });
    }
  })
  .catch((error) => {
    alert('Unsuccessful, error: ' + error);
  });

  items.sort((a, b) => a.index - b.index);
  return items.map((item) => ({ x: item.index, y: item.value })); // Return array of objects with x and y values for graphing
}

async function getSessionData(userID, sessionId, dataType) {
  const items = [];
  const dbref = ref(db);

  await get(child(dbref, `users/${userID}/sessions/${sessionId}/data/${dataType}`)).then((snapshot) => {
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const key = Number(child.key);
        if (!Number.isNaN(key)) {
          items.push({ index: key, value: child.val() });
        }
      });
    }
  })
  .catch((error) => {
    alert('Unsuccessful, error: ' + error);
  });

  items.sort((a, b) => a.index - b.index);
  return items.map((item) => ({ x: item.index, y: item.value }));
}

async function loadSessions(userID) {
  const sessionsSelect = document.getElementById('historySessions');
  if (!sessionsSelect) return;

  sessionsSelect.innerHTML = '';
  sessionsSelect.append(new Option('Select a session', '', true, true));

  const dbref = ref(db);
  await get(child(dbref, `users/${userID}/sessions`)).then((snapshot) => {
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const session = child.val();
        if (session.active) {
          if (activeSessionId !== session.id) {
            sessionDataStarted = true;
            setCurrentSession(session);
          }
        } else {
          const label = session.name || `Session ${new Date(session.createdAt).toLocaleString()}`;
          sessionsSelect.append(new Option(label, child.key));
        }
      });
    }
  })
  .catch((error) => {
    console.error('Unable to load sessions:', error);
  });

  updateSessionControls();
  updateHistoryControls();
}

async function createSession(userID) {
  const createdAt = Date.now();
  const id = `session-${createdAt}`;
  const sessionName = `Session ${new Date(createdAt).toLocaleString()}`;
  const session = {
    createdAt,
    id,
    name: sessionName,
    active: true,
    summary: {
      riskLabel: 'Waiting for data',
      highRiskMinutes: 0,
      alertCount: 0,
      neutralPercent: 100,
      exposurePercent: 0,
      breakRecommendation: 'Waiting for first sensor values'
    }
  };
  try {
    await update(ref(db, `users/${userID}/sessions/${id}`), session);
    return { id, name: sessionName };
  } catch (error) {
    console.error('Unable to create session:', error);
    return null;
  }
}

async function setCurrentSession(session) {
  activeSessionId = session.id;
  activeSessionName = session.name;
  sessionDataCounts = { bend: 0, emg: 0, imu: 0 };
  await setServerSessionId(activeSessionId);
  setCurrentSessionLabel(activeSessionName);
  updateSessionControls();
  if (sensorChart && typeof sensorChart.destroy === 'function') {
    sensorChart.destroy();
  }
  createChart(document.getElementById('dataType').value, 'sensorGraph').then(chart => {
    sensorChart = chart;
  });
}

async function updateSessionSummary(userID, sessionId, summary) {
  if (!sessionId) return;
  try {
    await update(ref(db, `users/${userID}/sessions/${sessionId}/summary`), summary);
  } catch (error) {
    console.error('Unable to update session summary:', error);
  }
}

async function deleteSession(userID, sessionId) {
  if (!sessionId) return;
  try {
    await remove(ref(db, `users/${userID}/sessions/${sessionId}`));
    if (activeSessionId === sessionId) {
      activeSessionId = null;
      sessionDataCounts = { bend: 0, emg: 0, imu: 0 };
      isCollecting = false;
    }
  } catch (error) {
    console.error('Unable to delete session:', error);
  }
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
  return summary;
}

// Function that creates a chart from sensor data
async function createChart(dataType, id, sessionId = activeSessionId, updateSummary = true){
  let data = [];
  if (sessionId) {
    data = await getSessionData(window.currentUser.uid, sessionId, dataType);
  }

  let label = '';
  let datasets = [];

  if (dataType === "bend") {
    label = 'Wrist Flexion (%)';
    datasets.push(
      {
        label:    `${label}`,     // Dataset label for legend
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
  } else if (dataType === "emg") {
    label = 'Muscle Activity (mV)';
    datasets.push(
      {
        label:    `${label}`,     // Dataset label for legend
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
  } else if (dataType === "imu") {
    label = 'Wrist Rotation (°)';
    datasets.push(
      {
        label:    `${label}`,     // Dataset label for legend
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
            text: `${label}`,     // y-axis title
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
            text: `${label} Over Time`,
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

  if (updateSummary) {
    updateDashboardSummary(dataType, data);
  }
  return chart;
}

function destroyHistoryChart() {
  if (historyChart && typeof historyChart.destroy === 'function') {
    historyChart.destroy();
  }
  historyChart = null;
}

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
window.addEventListener('DOMContentLoaded', async function() {
  if (!window.currentUser) {
    const storedUser = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || 'null');
    if (storedUser) {
      window.currentUser = storedUser;
    }
  }

  if (!window.currentUser) {
    alert("No user is currently signed in. Redirecting to sign in page.");
    window.location = "/signIn";
    return;
  }

  activeSessionId = null;
  activeSessionName = '';
  selectedHistorySessionId = '';

  sensorChart = await createChart('bend', 'sensorGraph');

  updateCollectButtonState();
  setCurrentSessionLabel('No active session');
  setDataActivityStatus(false);

  await loadSessions(window.currentUser.uid);

  // Track Firebase connectivity state
  const connectedRef = ref(db, '.info/connected');
  onValue(connectedRef, (snapshot) => {
    setConnectionStatus(snapshot.val() === true);
  });

  // Create a new chart with the selected data type when the dropdown value changes
  document.getElementById('dataType').addEventListener('change', (event) => {
    dataType = event.target.value;

    if (sensorChart && typeof sensorChart.destroy === 'function') {
      sensorChart.destroy(); // Destroy current chart before creating new one
    }

    createChart(dataType, 'sensorGraph').then(chart => {
      sensorChart = chart;
      if (isCollecting && activeSessionId) {
        startRealTimeUpdates(dataType);
      }
    });
  });

  document.getElementById('historyDataType').addEventListener('change', async (event) => {
    historyDataType = event.target.value;

    if (selectedHistorySessionId) {
      destroyHistoryChart();
      historyChart = await createChart(historyDataType, 'historyGraph', selectedHistorySessionId, false);
    }
  });

  document.getElementById('historySessions').addEventListener('change', async (event) => {
    selectedHistorySessionId = event.target.value;
    if (!selectedHistorySessionId) {
      destroyHistoryChart();
      updateHistorySummary(null);
      updateHistoryControls();
      return;
    }

    const summary = await getSessionSummary(window.currentUser.uid, selectedHistorySessionId);
    updateHistorySummary(summary);
    destroyHistoryChart();
    historyChart = await createChart(historyDataType, 'historyGraph', selectedHistorySessionId, false);
    updateHistoryControls();
  });

  document.getElementById('collectBtn').addEventListener('click', async () => {
    if (!activeSessionId) {
      alert('Please create a session before collecting data.');
      return;
    }

    if (isCollecting) {
      stopRealTimeUpdates();
    } else {
      startRealTimeUpdates(dataType);
    }
  });

  document.getElementById('newSessionBtn').addEventListener('click', async () => {
    if (!activeSessionId) {
      const userID = window.currentUser.uid;

      stopRealTimeUpdates();

      const newSession = await createSession(userID);
      if (newSession) {
        setCurrentSession(newSession);
      }
    }
  });

  document.getElementById('endSessionBtn').addEventListener('click', async () => {
    if (activeSessionId) {
      const userID = window.currentUser.uid;
      const sessionsSelect = document.getElementById('historySessions');
      
      stopRealTimeUpdates();

      try {
        await update(ref(db, `users/${userID}/sessions/${activeSessionId}`), { active: false });
      } catch (error) {
        console.error('Unable to end session:', error);
      }

      await loadSessions(userID);
      if (sessionsSelect) {
        sessionsSelect.value = '';
      }
      selectedHistorySessionId = '';

      activeSessionId = null;
      activeSessionName = '';
      sessionDataCounts = { bend: 0, emg: 0, imu: 0 };
      await setServerSessionId(null);
      setCurrentSessionLabel('No active session');
      updateSessionControls();

      const modal = document.getElementById('endSessionModal');
      const modalInstance = bootstrap.Modal.getInstance(modal);
      modalInstance.hide();
    }
  });

  document.getElementById('deleteSessionBtn').addEventListener('click', async () => {
    const sessionsSelect = document.getElementById('historySessions');
    const selectedSession = sessionsSelect ? sessionsSelect.value : '';
    if (!selectedSession) return;

    if (confirm('Delete this session permanently? This cannot be undone.')) {
      const userID = window.currentUser.uid;
      await deleteSession(userID, selectedSession);
      if (activeSessionId === selectedSession) {
        activeSessionId = null;
        activeSessionName = '';
        stopRealTimeUpdates();
        await setServerSessionId(null);
        setCurrentSessionLabel('No active session');
        updateSessionControls();
      }
      selectedHistorySessionId = '';
      await loadSessions(userID);
      if (sessionsSelect) {
        sessionsSelect.value = '';
      }
      destroyHistoryChart();
      updateHistorySummary(null);
      updateHistoryControls();
      if (sensorChart && typeof sensorChart.destroy === 'function') {
        sensorChart.destroy();
      }
      createChart(document.getElementById('dataType').value, 'sensorGraph').then(chart => {
        sensorChart = chart;
      });
    }
  });

  // Stop real-time updates when page unloads (user navigates away or logs out)
  window.addEventListener('beforeunload', () => {
    stopRealTimeUpdates();
  });
});