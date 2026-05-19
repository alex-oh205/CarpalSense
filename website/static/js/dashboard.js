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
let historyChart = null;                              // History chart instance reference
let updateInterval = null;                            // Real-time update interval reference
let dataType = 'bend';
let historyDataType = 'bend';
let isCollecting = false;
let sessionDataStarted = false;
let activeSessionId = null;                            // Currently recording session
let activeSessionName = '';
let selectedHistorySessionId = '';

// --------------------- Utility Functions ----------------------------
// Formats date to display only time (HH:MM:SS)
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// --------------------- State Update Functions ----------------------------
// Updates the connection status badge on the dashboard
function setConnectionStatus(isConnected) {
  const status = document.getElementById('connectionStatus');
  status.textContent = isConnected ? 'Connected' : 'Disconnected';
  status.className = `badge rounded-pill status-badge ${isConnected ? 'status-good' : 'status-critical'}`;
}

// Updates the data activity status badge on the dashboard
function setDataActivityStatus(isActive) {
  const mode = document.getElementById('modeStatus');
  mode.textContent = isActive ? 'Active' : 'No updates';
  mode.className = `badge rounded-pill status-badge ${isActive ? 'status-good' : 'status-warning'}`;
}

// Updates the current session label on the dashboard
function setCurrentSessionLabel(label) {
  const labelEl = document.getElementById('currentSessionLabel');
  if (!labelEl) return;
  labelEl.textContent = label || 'No active session';
}

// Updates the state of session control buttons
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

// Updates the state of history control buttons
function updateHistoryControls() {
  const deleteBtn = document.getElementById('deleteSessionBtn');
  deleteBtn.disabled = !selectedHistorySessionId;
}

// Updates the state of the collect button
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

// --------------------- Session Management Functions ----------------------
// Creates a new session in Firebase and returns the session ID and name
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
      riskClass: 'metric-value-neutral',
      highRiskMinutes: 0,
      totalTime: 0,
      alertCount: 0,
      neutralPercent: 100,
      exposurePercent: 0,
      breakRecommendation: 'Waiting for first sensor values',
      alerts: []
    },
    data: {
      flexCounter: 0,
      emgCounter: 0
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

// Sets the active session ID on the server
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

// Sets the current active session on the dashboard
function setCurrentSession(session) {
  activeSessionId = session.id;
  activeSessionName = session.name;
  setServerSessionId(activeSessionId);
  setCurrentSessionLabel(activeSessionName);
  updateSessionControls();
}

// Loads user's sessions from Firebase and populates the session history dropdown
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

// Deletes a session from Firebase
async function deleteSession(userID, sessionId) {
  if (!sessionId) return;
  try {
    await remove(ref(db, `users/${userID}/sessions/${sessionId}`));
    if (activeSessionId === sessionId) {
      activeSessionId = null;
      isCollecting = false;
    }
  } catch (error) {
    console.error('Unable to delete session:', error);
  }
}

// ---------------------- Session Summary Functions ----------------------------

// Calculates risk, summary info, and alerts using sensor data
async function calculateRiskAndSummary() {
  const flexData = await getSessionData(window.currentUser.uid, activeSessionId, 'bend');
  const emgData = await getSessionData(window.currentUser.uid, activeSessionId, 'emg');
  const imuData = await getSessionData(window.currentUser.uid, activeSessionId, 'imu');

  const summary = {
    riskLabel: 'Good',
    riskClass: 'metric-value-good',
    highRiskMinutes: 0,
    totalTime: 0,
    alertCount: 0,
    neutralPercent: 100,
    exposurePercent: 0,
    breakRecommendation: 'None',
    alerts: []
  };

  if (flexData.length === 0 && emgData.length === 0 && imuData.length === 0) {
    summary.riskLabel = 'Waiting for data';
    summary.riskClass = 'metric-value-neutral';
    summary.breakRecommendation = 'Waiting for first sensor values';
    updateSessionSummary(window.currentUser.uid, activeSessionId, summary);
    return summary;
  }

  // const latestFlex = flexData[flexData.length - 1]?.y;
  // const latestEmg = emgData[emgData.length - 1]?.y;
  // const latestImu = imuData[imuData.length - 1]?.y;
  const snapshot1 = await get(ref(db, `users/${window.currentUser.uid}/sessions/${activeSessionId}/summary/alertCount`));
  if (snapshot1.exists()) {
    summary.alertCount = snapshot1.val();
  }
  let alertNum = 0;
  const snapshot2 = await get(ref(db, `users/${window.currentUser.uid}/sessions/${activeSessionId}/summary/alerts`));
  if (snapshot2.exists()) {
    alertNum = Object.values(snapshot2.val()).length;
  }
  let flexCounter = 0;
  const snapshot3 = await get(ref(db, `users/${window.currentUser.uid}/sessions/${activeSessionId}/data/flexCounter`));
  if (snapshot3.exists()) {
    flexCounter = snapshot3.val();
  }
  let emgCounter = 0;
  const snapshot4 = await get(ref(db, `users/${window.currentUser.uid}/sessions/${activeSessionId}/data/emgCounter`));
  if (snapshot4.exists()) {
    emgCounter = snapshot4.val();
  }
  let warningLabel = 'Good';
  let warningClass = 'metric-value-good';

  if (flexCounter > 250) {
    warningLabel = 'High';
    warningClass = 'metric-value-critical';
    summary.alerts.push('Wrist bend has been high for an extended period. Adjust posture.');
  } else if (flexCounter > 125) {
    if (warningLabel === 'Good') {
      warningLabel = 'Caution';
      warningClass = 'metric-value-warning';
    }
    summary.alerts.push('Wrist bend is high.');
  }

  if (emgCounter > 100) {
    warningLabel = 'High';
    warningClass = 'metric-value-critical';
    summary.alerts.push('Wrist tension has been high for an extended period. Relax your wrist.');
  } else if (emgCounter > 50) {
    if (warningLabel === 'Good') {
      warningLabel = 'Caution';
      warningClass = 'metric-value-warning';
    }
    summary.alerts.push('Wrist tension is high.');
  }

  summary.alertCount += Math.max(summary.alerts.length - alertNum, 0);

  // if (imuCounter > 250) {
  //   warningLabel = 'High';
  //   warningClass = 'metric-value-critical';
  //   summary.alerts.push('Wrist angle is extreme. Return to neutral position.');
  // } else if (imuCounter > 125) {
  //   if (warningLabel === 'Good') {
  //     warningLabel = 'Caution';
  //     warningClass = 'metric-value-warning';
  //   }
  //   summary.alerts.push('Wrist angle is out of neutral range. Correct posture.');
  // }

  summary.riskLabel = warningLabel;
  summary.riskClass = warningClass;

  const highRiskSamplesFlex = flexData.filter(point => {
    return point.y > 65;
  }).map(point => point.x);
  const highRiskSamplesEmg = emgData.filter(point => {
    return point.y > 65;
  }).map(point => point.x);
  // const highRiskSamplesImu = imuData.filter(point => {
  //   return Math.abs(point.y) > 35;
  // }).map(point => point.x);

  // 1 second interval between each data point
  const highRiskSeconds = [...new Set([...highRiskSamplesFlex, ...highRiskSamplesEmg])].length * 1;
  const totalSeconds = flexData.length > 0 ? flexData[flexData.length - 1].x : 0;

  summary.highRiskMinutes = Math.round(highRiskSeconds / 6) / 10;
  summary.totalTime = Math.round(totalSeconds / 6) / 10;
  summary.neutralPercent = totalSeconds === 0 ? 100 : Math.round(((totalSeconds - highRiskSeconds) / totalSeconds) * 100);
  summary.exposurePercent = totalSeconds === 0 ? 0 : Math.round((highRiskSeconds / totalSeconds) * 100);

  if (summary.alerts.length === 0) {
    summary.alerts.push('No active alerts.');
  }

  if (summary.exposurePercent > 50) {
    summary.breakRecommendation = 'Stop and take a break';
  } else if (summary.exposurePercent > 25) {
    summary.breakRecommendation = 'Take a break soon';
  } else {
    summary.breakRecommendation = 'None';
  }

  updateSessionSummary(window.currentUser.uid, activeSessionId, summary);

  return summary;
}

// Builds alert list items on dashboard
function buildAlerts(messages) {
  const alertList = document.getElementById('alertList');
  alertList.innerHTML = '';

  if (!messages.length) {
    alertList.innerHTML = '<li class="list-group-item alert-item">No active alerts.</li>';
    return;
  }

  messages.forEach(message => {
    const li = document.createElement('li');

    li.className = 'list-group-item alert-item';
    if (message.includes('extended')) {
      li.className = 'list-group-item alert-item border border-danger';
    } else if (message.includes('high')) {
      li.className = 'list-group-item alert-item border border-warning';
    }

    li.textContent = message;
    alertList.appendChild(li);
  });
}

// Updates the dashboard summary display
async function updateDashboardSummary() {
  const summary = await calculateRiskAndSummary();
  const riskLevel = document.getElementById('riskLevel');
  const highRiskMinutes = document.getElementById('highRiskMinutes');
  const alertCount = document.getElementById('alertCount');
  const lastUpdate = document.getElementById('lastUpdate');
  const neutralTime = document.getElementById('neutralTime');
  const motionExposure = document.getElementById('motionExposure');
  // const breakRecommendation = document.getElementById('breakRecommendation');

  riskLevel.textContent = summary.riskLabel;
  riskLevel.className = `metric-value ${summary.riskClass}`;
  highRiskMinutes.textContent = `${summary.highRiskMinutes.toFixed(1)} min`;
  alertCount.textContent = summary.alertCount;
  lastUpdate.textContent = formatTime(new Date());
  neutralTime.textContent = `${(summary.totalTime - summary.highRiskMinutes).toFixed(1)} min`;
  motionExposure.textContent = `${summary.exposurePercent}%`;
  // breakRecommendation.textContent = summary.breakRecommendation;
  buildAlerts(summary.alerts);
}

// Updates the past session summary display
function updateHistorySummary(summary) {
  const riskLevel = document.getElementById('historyRiskLevel');
  const highRiskMinutes = document.getElementById('historyHighRiskMinutes');
  const alertCount = document.getElementById('historyAlertCount');
  const neutralTime = document.getElementById('historyNeutralTime');
  const motionExposure = document.getElementById('historyMotionExposure');
  // const breakRecommendation = document.getElementById('historyBreakRecommendation');

  if (!riskLevel || !highRiskMinutes || !alertCount || !neutralTime || !motionExposure) return;

  if (!summary) {
    riskLevel.textContent = '--';
    riskLevel.className = 'summary-value';
    highRiskMinutes.textContent = '--';
    alertCount.textContent = '--';
    neutralTime.textContent = '--';
    motionExposure.textContent = '--';
    // breakRecommendation.textContent = '--';
    return;
  }

  riskLevel.textContent = summary.riskLabel || '--';
  riskLevel.className = `summary-value ${summary.riskClass || ''}`;
  highRiskMinutes.textContent = summary.highRiskMinutes != null ? `${summary.highRiskMinutes.toFixed(1)} min` : '--';
  alertCount.textContent = summary.alertCount != null ? summary.alertCount : '--';
  neutralTime.textContent = summary.totalTime != null ? `${(summary.totalTime - summary.highRiskMinutes).toFixed(1)} min` : '--';
  motionExposure.textContent = summary.exposurePercent != null ? `${summary.exposurePercent}%` : '--';
  // breakRecommendation.textContent = summary.breakRecommendation || '--';
}

// Updates session summary in Firebase
async function updateSessionSummary(userID, sessionId, summary) {
  if (!sessionId) return;
  summary = structuredClone(summary);
  if (summary.alerts[0] === 'No active alerts.') {
    summary.alerts.shift();
  }
  try {
    await update(ref(db, `users/${userID}/sessions/${sessionId}/summary`), summary);
  } catch (error) {
    console.error('Unable to update session summary:', error);
  }
}

// Gets session summary from Firebase
async function getSessionSummary(userID, sessionId) {
  if (!sessionId) return null;
  const dbref = ref(db);
  const snapshot = await get(child(dbref, `users/${userID}/sessions/${sessionId}/summary`));
  return snapshot.exists() ? snapshot.val() : null;
}

// --------------------- Data and Chart Functions ----------------------------

// Gets session sensor data from Firebase
async function getSessionData(userID, sessionId, dataType) {
  const items = [];
  const dbref = ref(db);

  await get(child(dbref, `users/${userID}/sessions/${sessionId}/data/${dataType}`)).then((snapshot) => {
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const key = Number(child.key);
        if (!Number.isNaN(key)) {
          items.push({ index: key / 1000, value: child.val() });
        }
      });
    }
  })
  .catch((error) => {
    console.log('Unsuccessful, error: ' + error);
  });

  items.sort((a, b) => a.index - b.index);
  return items.map((item) => ({ x: item.index, y: item.value }));
}

// Creates a chart from sensor data
async function createChart(dataType, id, sessionId = activeSessionId, updateSummary = true, showAll = false){
  let data = [];
  if (sessionId) {
    data = await getSessionData(window.currentUser.uid, sessionId, dataType);
  }

  let label = '';
  let datasets = [];
  let maximumMin = 0;

  if (dataType === "bend") {
    label = 'Wrist Flexion (%)';
    maximumMin = -100;
    datasets.push(
      {
        label:    `${label}`,     // Dataset label for legend
        data,
        fill:     true,           // Fill area under the linechart
        backgroundColor:  'rgba(255, 107, 169, 0.1)',    // Gradient fill color
        borderColor:      'rgba(255, 107, 169, 0.8)',    // Line color
        borderWidth:      2.5,   // Line width
        pointRadius:      0,
        pointBackgroundColor: 'rgba(255, 107, 169, 1)',
        pointBorderColor: '#111827',
        pointBorderWidth: 1,
        pointHoverRadius: 5,
        tension: 0.4
      }
    );
  } else if (dataType === "emg") {
    label = 'Muscle Activity (%)';
    datasets.push(
      {
        label:    `${label}`,     // Dataset label for legend
        data,
        fill:     true,           // Fill area under the linechart
        backgroundColor:  'rgba(122, 167, 255, 0.1)',    // Gradient fill color
        borderColor:      'rgba(122, 167, 255, 0.85)',   // Line color
        borderWidth:      2.5,   // Line width
        pointRadius:      0,
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
        pointRadius:      0,
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
            text: 'Time (s)',     // x-axis title
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
          },
          suggestedMax: 60,
          min: showAll || !data.at(-1) ? 0 : Math.max(0, Math.round((data.at(-1).x - 60) * 10) / 10),
          max: data.at(-1) ? Math.max(60, Math.round((data.at(-1).x + 1) * 10) / 10) : 60
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
          },
          suggestedMax: 100,
          suggestedMin: maximumMin
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
    updateDashboardSummary();
  }
  return chart;
}

// Updates chart data in real-time
async function updateChartData(chart, dataType) {
  if (!activeSessionId) return;
  try {
    setDataActivityStatus(true);
    const newData = await getSessionData(window.currentUser.uid, activeSessionId, dataType);

    // Update the chart's data
    chart.data.datasets[0].data = newData;
    const latestX = newData.at(-1)?.x;
    if (latestX && latestX > 60) {
      chart.options.scales.x.min = Math.round((latestX - 60) * 10) / 10;
      chart.options.scales.x.max = Math.round((latestX + 1) * 10) / 10;
    }

    // Update the chart to reflect new data
    chart.update('none'); // 'none' prevents animation for smoother real-time updates
    await updateDashboardSummary();
  } catch (error) {
    console.error('Error updating chart data:', error);
    setDataActivityStatus(false);
  }
}

// Starts real-time updates
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

// Stops real-time updates
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

// Destroys history chart instance
function destroyHistoryChart() {
  if (historyChart && typeof historyChart.destroy === 'function') {
    historyChart.destroy();
  }
  historyChart = null;
}

// --------------------------- Home Page Loading -----------------------------
window.addEventListener('DOMContentLoaded', async () => {
  // Check if signed in, if not redirect to sign-in page
  if (!window.currentUser) {
    const storedUser = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || 'null');
    if (storedUser) {
      window.currentUser = storedUser;
    }
  }

  if (!window.currentUser) {
    window.location = "/signIn";
    return;
  }

  // Initialize dashboard
  activeSessionId = null;
  activeSessionName = '';
  selectedHistorySessionId = '';

  updateCollectButtonState();
  setCurrentSessionLabel('No active session');
  setDataActivityStatus(false);

  await loadSessions(window.currentUser.uid);

  sensorChart = await createChart(dataType, 'sensorGraph');

  historyChart = await createChart(historyDataType, 'historyGraph', selectedHistorySessionId, false, true);

  // Update graph on sensor type dropdown change
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

  // Update history graph on history sensor type dropdown change
  document.getElementById('historyDataType').addEventListener('change', async (event) => {
    historyDataType = event.target.value;
    destroyHistoryChart();
    historyChart = await createChart(historyDataType, 'historyGraph', selectedHistorySessionId, false, true);
  });

  // Update history graph on session selection change
  document.getElementById('historySessions').addEventListener('change', async (event) => {
    selectedHistorySessionId = event.target.value;
    const summary = await getSessionSummary(window.currentUser.uid, selectedHistorySessionId);
    updateHistorySummary(summary);
    destroyHistoryChart();
    historyChart = await createChart(historyDataType, 'historyGraph', selectedHistorySessionId, false, true);
    updateHistoryControls();
  });

  // Start/pause data collection on collect button click
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

  // Create new session on new session button click
  document.getElementById('newSessionBtn').addEventListener('click', async () => {
    if (!activeSessionId) {
      const userID = window.currentUser.uid;

      stopRealTimeUpdates();

      const newSession = await createSession(userID);
      if (newSession) {
        setCurrentSession(newSession);
        if (sensorChart && typeof sensorChart.destroy === 'function') {
          sensorChart.destroy();
        }
        createChart(document.getElementById('dataType').value, 'sensorGraph').then(chart => {
          sensorChart = chart;
        });
      }
    }
  });

  // End session on end session button click (in modal)
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
      await setServerSessionId(null);
      setCurrentSessionLabel('No active session');
      updateSessionControls();

      const modal = document.getElementById('endSessionModal');
      const modalInstance = bootstrap.Modal.getInstance(modal);
      modalInstance.hide();
    }
  });

  // Delete past session on delete session button click (on modal)
  document.getElementById('deleteSessionConfirmBtn').addEventListener('click', async () => {
    const sessionsSelect = document.getElementById('historySessions');
    const selectedSession = sessionsSelect ? sessionsSelect.value : '';
    if (!selectedSession) return;

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
    historyChart = await createChart(historyDataType, 'historyGraph', selectedHistorySessionId, false, true);
    updateHistorySummary(null);
    updateHistoryControls();
    if (sensorChart && typeof sensorChart.destroy === 'function') {
      sensorChart.destroy();
    }
    createChart(document.getElementById('dataType').value, 'sensorGraph').then(chart => {
      sensorChart = chart;
    });

    const modal = document.getElementById('deleteSessionModal');
    const modalInstance = bootstrap.Modal.getInstance(modal);
    modalInstance.hide();
  });

  // Stop real-time updates when page unloads (user navigates away or logs out)
  window.addEventListener('beforeunload', () => {
    stopRealTimeUpdates();
  });
});