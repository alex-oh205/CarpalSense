/*
Purpose:
 This sketch collects data from an Arduino sensor and sends it
 to a Flask server.  The Flask server will then update the corresonding
 Firebase realtime database.

Notes:
 1.  This example is written for a network using WPA encryption. 
 2.  Circuit:  Arduino Nano IoT, HC_SR04 rangefinder.  Modify as 
     necessary for your setup.

Instructions:
 1.  Replace the asterisks (***) with your specific network SSIS (network name) 
     and password on the "arduino_secrets.h" tab (these are case sensitive). DO NOT change lines 43, 44.
 2.  Update Line 53 with the IP address for the computer running the Flask server.
     Note the use of commas in the IP address format:  ***,***,***,***
 3.  Update Line 135 with the same IP address you added to Line 53, except this time
     use periods between groups of digits, not commas (i.e.,  ***.***.***.***)
 4.  Don't change any other lines of code.

 Steps 5 - 8 should only be performed when you are prepared to test your wearable sensor function.
 5.  Rename the range() function on line 121 with the function for your circuit (and update the comment on line 120)
 6.  Rename the route and variable names "test?distance" & "distance" on line 131 for your specific sensor
 7.  Replace the range() function (lines 162 - 171) with your the data collection function for
     your circuit.
 8.  Update the global variables, constants and pins for your wearable sensor circuit.
 */

// Library Inclusions
#include <SPI.h>              // Wireless comms between sensor(s) and Arduino Nano IoT
#include <WiFiNINA.h>         // Used to connect Nano IoT to network
#include <ArduinoJson.h>      // Used for HTTP Request
#include "arduino_secrets.h"  // Used to store private network info

//============START OF SENSOR LIBRARIES AND VARIABLES=============

// --- Arduino Libraries ---
#if defined(ARDUINO) && ARDUINO >= 100
#include "Arduino.h"
#else
#include "WProgram.h"
#endif

#include <limits.h>       // Used for window timing
#include "EMGFilters.h"

// --- FLEX SENSOR: Pin & Circuit ---
const int   FLEX_PIN = A6;
const float FLEX_VCC = 3.3;
const float FLEX_R_DIV = 47000.0;

// --- FLEX SENSOR: Calibration ---
int flex_position = 0;
int flex_rawFlat     = 550;  // Resting flat value
int flex_rawForward  = 420;   // Raw when fully bent forward
int flex_rawBackward = 610;  // Raw when fully bent backward

const int flex_DEADZONE = 2;
int returnValue = 0;        // Flex sensor output: 0 (flat) to 3 (full bend)
int level = 0;             // EMG output: 0 (no contraction) to 3 (high contraction)


// --- EMG SENSOR: Pin & RMS Setup ---
#define SensorInputPin A5
#define RMS_WINDOW 100

float pct = 0.0f;
long emg_rmsBuffer[RMS_WINDOW] = {0};
int  emg_rmsIndex = 0;
long emg_rmsSum   = 0;

static long emg_Threshold = 2000;

// --- EMG SENSOR: Filter Setup ---
EMGFilters myFilter;
SAMPLE_FREQUENCY sampleRate = SAMPLE_FREQ_500HZ;
NOTCH_FREQUENCY  humFreq    = NOTCH_FREQ_60HZ;

unsigned long emg_timeStamp;
const unsigned long emg_timeBudget = 2000;

// --- EMG SENSOR: Contraction Window Settings ---
// Percent spread = ((max - min) / min) * 100
const unsigned long emg_WINDOW_MS       = 1000;     // length of each observation window in milliseconds
const float         emg_THRESH_LOW_PCT  = 35.0f;
const float         emg_THRESH_MED_PCT  = 55.0f;
const float         emg_THRESH_HIGH_PCT = 75.0f;

unsigned long emg_windowStart = 0;
long          emg_windowMin   = LONG_MAX;
long          emg_windowMax   = 0;

// --- MATH MODEL: Counter & CTS Risk ---
long          ctsCounter             = 0;         // total weighted score
const long    CTS_THRESHOLD          = 500;       // threshold to alert user of CTS risk
bool          ctsRisk                = false;

int           emg_history[3]         = {0, 0, 0}; // array of the last 3 readings for EMG
int           flex_history[3]        = {0, 0, 0}; // array of the last 3 readings for flex
int           historyIndex           = 0;
bool          historyFull            = false;
const int     SPIKE_FILTER_THRESHOLD = 4;         // minimum value of the combined three readings to filter out random spikes
int flex_sum = 0;
int emg_sum = 0;

// ==========END OF SENSOR LIBRARIES AND VARIABLES===================

///////please enter your sensitive data in the Secret tab/arduino_secrets.h
char ssid[] = SECRET_SSID;    // your network SSID (name)
char pass[] = SECRET_PASS;    // your network password (use for WPA, or use as key for WEP)
int keyIndex = 0;             // your network key index number (needed only for WEP)
int status = WL_IDLE_STATUS;

// Initialize the Wifi client library
WiFiClient client;

// server address:
//char server[] = "jsonplaceholder.typicode.com"; // for public domain server
IPAddress server(172, 20, 10, 6); // for localhost server (server IP address can be found with ipconfig or ifconfig)

unsigned long lastConnectionTime = 0;
const unsigned long postingInterval = 10L * 50L; // delay between updates, in milliseconds (10L * 50L is around 1 second between requests)

// ============START OF BME SENSOR SETUP=============
// --- EMG SENSOR: RMS Helper ---
long computeRMS(long newVal) {
    if (newVal > 200000) newVal = 200000;
    emg_rmsSum -= emg_rmsBuffer[emg_rmsIndex];
    emg_rmsBuffer[emg_rmsIndex] = newVal;
    emg_rmsSum += newVal;
    emg_rmsIndex = (emg_rmsIndex + 1) % RMS_WINDOW;
    return emg_rmsSum / RMS_WINDOW;
}

// --- EMG SENSOR: Labels ---
const char* levelLabel(int lvl) {
    switch (lvl) {
        case 0:  return "No Contraction";
        case 1:  return "Low";
        case 2:  return "Medium";
        case 3:  return "High";
        default: return "---";
    }
}

void setup(){
  // --- EMG SENSOR: Setup ---
  analogReference(AR_DEFAULT);
  analogReadResolution(12);
  myFilter.init(sampleRate, humFreq, true, true, true);
  Serial.begin(9600);
  delay(1000);

  for (int i = 0; i < 2000; i++) {
      analogRead(SensorInputPin);
      int Value = analogRead(SensorInputPin);
      myFilter.update(Value - 3700);
      delayMicroseconds(2000);
  }

  // --- FLEX SENSOR: Setup ---
  pinMode(FLEX_PIN, INPUT);
  emg_windowStart = millis();
// ============END OF BME SENSOR SETUP=============

  while (!Serial) {
    ; // wait for serial port to connect. Needed for native USB port only
  }

  // check for the WiFi module:
  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("Communication with WiFi module failed!"); // don't continue
    while (true);
  }

  // check if firmware is outdated
  String fv = WiFi.firmwareVersion(); 
  if (fv < WIFI_FIRMWARE_LATEST_VERSION) {
    Serial.println("Please upgrade the firmware");
  }

  // attempt to connect to Wifi network:
  while (status != WL_CONNECTED) {
    Serial.print("Attempting to connect to SSID: ");
    Serial.println(ssid); // Connect to WPA/WPA2 network. Change this line if using open or WEP network:
    status = WiFi.begin(ssid, pass);
    delay(1000); // wait 1 second for connection
  }

  printWifiStatus(); // you're connected now, so print out the status
}

void loop() {

    // --- EMG Data Collection ---
    emg_timeStamp = micros();
    while (millis() - emg_windowStart < emg_WINDOW_MS) {    // IMPORTANT: Runs the EMG code enough times to actually return usable data
      analogRead(SensorInputPin);
      int emg_Value = analogRead(SensorInputPin);
      int centered  = emg_Value - 3700;
      int filtered  = myFilter.update(centered);
      long envelope = (long)filtered * filtered;
      long smoothed = computeRMS(envelope);

      if (smoothed < emg_windowMin) emg_windowMin = smoothed;
      if (smoothed > emg_windowMax) emg_windowMax = smoothed;
    }

    // --- Flex Data Collection ---
    flex_position = 0;
    int flex_raw = analogRead(FLEX_PIN);
    float flex_voltage    = flex_raw * (FLEX_VCC / 4095.0);  // fixed: 12-bit ADC
    float flex_resistance = 0;
    if (flex_voltage > 0) {
        flex_resistance = FLEX_R_DIV * (FLEX_VCC / flex_voltage - 1.0);
    }

    if (flex_raw < flex_rawFlat - flex_DEADZONE) {
        flex_position = constrain(
            (int)((flex_rawFlat - flex_raw) / (float)(flex_rawFlat - flex_rawForward) * 100.0),
            0, 100
        );
    } else if (flex_raw > flex_rawFlat + flex_DEADZONE) {
        flex_position = constrain(
            (int)((flex_raw - flex_rawFlat) / (float)(flex_rawBackward - flex_rawFlat) * 100.0),
            0, 100
        ) * -1;
    }

    const char* flex_direction;
    const char* flex_zone;

    if (flex_position > flex_DEADZONE) {
        flex_direction = "FORWARD";
        if      (flex_position < 40) { flex_zone = "Slight";   returnValue = 1; }
        else if (flex_position < 75) { flex_zone = "Moderate"; returnValue = 2; }
        else                         { flex_zone = "Full";      returnValue = 3; }
    } else if (flex_position < -flex_DEADZONE) {
        flex_direction = "BACKWARD";
        if      (flex_position > -30) { flex_zone = "Slight";   returnValue = 1; }
        else if (flex_position > -55) { flex_zone = "Moderate"; returnValue = 2; }
        else                          { flex_zone = "Full";      returnValue = 3; }
    } else {
        flex_direction = "FLAT";
        flex_zone      = "";
        returnValue    = 0;
    }

    unsigned long now = millis();

      pct = 0.0f;
      if (emg_windowMin > 0) {
          pct = ((float)(emg_windowMax - emg_windowMin) / (float)emg_windowMin) * 100.0f;

          if      (pct >= emg_THRESH_HIGH_PCT) level = 3;
          else if (pct >= emg_THRESH_MED_PCT)  level = 2;
          else if (pct >= emg_THRESH_LOW_PCT)  level = 1;
          else                                 level = 0;
      }

      Serial.println("=======EMG SENSOR=======");
      Serial.print("min: ");        Serial.print(emg_windowMin);
      Serial.print("  max: ");      Serial.print(emg_windowMax);
      Serial.print("  spread: ");   Serial.print(pct, 1);
      Serial.print("%  ->  ");      Serial.println(levelLabel(level));

      Serial.println("=======FLEX SENSOR=======");
      Serial.print(flex_raw);
      Serial.print(" | ");          Serial.print(flex_voltage, 2);
      Serial.print("V | ");         Serial.print(flex_resistance / 1000.0, 1);
      Serial.print("KΩ | ");        Serial.print(flex_position);
      Serial.print(" | ");          Serial.print(flex_direction);
      Serial.print(" ");            Serial.print(flex_zone);
      Serial.print(" | ");          Serial.println(returnValue);

      // --- Math model ---
      emg_history[historyIndex]  = level;
      flex_history[historyIndex] = returnValue;
      historyIndex = (historyIndex + 1) % 3;      // Resets array every 3 loops
      if (historyIndex == 0) historyFull = true;

      emg_sum = 0;
      flex_sum = 0;
      bool emg_passed   = false;
      bool flex_passed  = false;
      int combinedScore = 0;

      if (historyFull) {
          emg_sum  = emg_history[0]  + emg_history[1]  + emg_history[2];
          flex_sum = flex_history[0] + flex_history[1] + flex_history[2];

          if (emg_sum  >= SPIKE_FILTER_THRESHOLD) {
            combinedScore += emg_sum;
            emg_passed  = true;
          } else {
            emg_sum = 0;
          }
          if (flex_sum >= SPIKE_FILTER_THRESHOLD) {
            combinedScore += flex_sum;
            flex_passed = true;
          } else {
            flex_sum = 0;
          }

          ctsCounter += combinedScore;
      }

      if (ctsCounter >= CTS_THRESHOLD) ctsRisk = true;

      Serial.println("=======MATH MODEL=======");
      Serial.print("EMG  last 3 sum: "); Serial.print(emg_history[0] + emg_history[1] + emg_history[2]);
      Serial.print("  passed: ");        Serial.println(emg_passed  ? "YES" : "NO");
      Serial.print("Flex last 3 sum: "); Serial.print(flex_history[0] + flex_history[1] + flex_history[2]);
      Serial.print("  passed: ");        Serial.println(flex_passed ? "YES" : "NO");
      Serial.print("Combined Score: ");  Serial.print(combinedScore);
      Serial.print("  |  Counter: ");    Serial.print(ctsCounter);
      Serial.print("  |  CTS Risk: ");   Serial.println(ctsRisk ? "TRUE" : "false");
      Serial.println();

      emg_windowMin   = LONG_MAX;
      emg_windowMax   = 0;
      emg_windowStart = millis();
//====================END OF BME CODE + MODEL===============

  StaticJsonDocument<200> doc;

  // if there's incoming data from the net connection, append each character to a variable
  String response = "";
  while (client.available()) {
    char c = client.read();
    response += (c);
  }

  // print out non-empty responses to serial monitor
  if (response != "") {
    Serial.println(response);
  }
  
  // repeat request after around 1 second
  if (millis() - lastConnectionTime > postingInterval) {
    httpRequest();
  }
}

// this method makes a HTTP connection to the server:
void httpRequest() {

  // close any connection before send a new request to free the socket
  client.stop();

  // if there's a successful connection:
  if (client.connect(server, 5000)) {
    Serial.println("connecting...");

    // send the HTTP GET request with the distance as a parameter.
    // The Flask route to call should be inbetween the "/" and "?" (ex:  GET /test?...
    // where "test" is the Flask route that will GET the data, "distance" is the key
    // and the value is provided by:  String(distance))
    String request = "GET /data?flex=" + String(flex_position) + "&emg=" + String(pct) + "&flexHigh=" + String(flex_sum) + "&emgHigh=" + String(emg_sum) + " HTTP/1.1";
    client.println(request);

    // set the host as server IP address
    client.println("Host: 172.20.10.9");

    // other request properties
    client.println("User-Agent: ArduinoWiFi/1.1");
    client.println("Connection: close");
    client.println();

    // note the time that the connection was made:
    lastConnectionTime = millis();
  } else {
    Serial.println("connection failed"); // couldn't make a connection
  }
}

// connect to wifi network and display status
void printWifiStatus(){
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());
  IPAddress ip = WiFi.localIP(); // your board's IP on the network
  Serial.print("IP Address: ");
  Serial.println(ip);
  long rssi = WiFi.RSSI(); // received signal strength
  Serial.print("signal strength (RSSI):");
  Serial.print(rssi);
  Serial.println(" dBm");
}