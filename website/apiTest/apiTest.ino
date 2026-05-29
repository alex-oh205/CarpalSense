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

//******** START OF SENSOR LIBRARIES AND VARIABLES ********

// Arduino Libraries
#include "Arduino.h"
#include <limits.h>       // used for window timing
#include "EMGFilters.h"   // needed for EMG code

// Flex Pins
const int   FLEX_PIN = A6;
const float FLEX_VCC = 3.3;
const float FLEX_RES = 47000.0;

// Flex Thresholds
int flexFlat = 550;  // flat value
int flexForward = 420;  // fully bent forward
int flexBackward = 610;  // fully bent backward

const int flexDead = 2;
int returnValue = 0;     // Flex: 0 = None to 3 = High
int level = 0;           // EMG: 0 = No Contraction to 3 = High Contraction

// EMG Pins + RMS
#define SensorInputPin A5
#define RMS_WINDOW 100

long emgBuffer[RMS_WINDOW] = {0};   
int  emgIndex = 0;
long emgRMS = 0;

// EMG Filter
EMGFilters myFilter;
SAMPLE_FREQUENCY sampleRate = SAMPLE_FREQ_500HZ;
NOTCH_FREQUENCY  humFreq    = NOTCH_FREQ_60HZ;

// EMG Thresholds
const unsigned long emgWindow = 1000;  // length of each observation window in milliseconds
const float emgLow = 50.0f;           
const float emgMedium = 100.0f;
const float emgHigh = 200.0f;

unsigned long windowStart = 0;         // Records the time between each EMG return
long windowMin = LONG_MAX;
long windowMax = 0;

// Math Model Values
long ctsCounter = 0;          // total weighted score
const long ctsThreshold = 500000;      // threshold to alert user of CTS risk
bool ctsRisk = false;

int emgMM[3] = {0, 0, 0};   // array of the last 3 readings for EMG
int flexMM[3] = {0, 0, 0};   // array of the last 3 readings for flex
int historyIndex = 0;
bool historyFull = false;
const int valueThreshold = 4; // minimum value of the combined three readings to filter out spikes
int flexSum = 0;
int emgSum = 0;

// ********** END OF SENSOR LIBRARIES AND VARIABLES *********

///////please enter your sensitive data in the Secret tab/arduino_secrets.h
char ssid[] = SECRET_SSID;    // your network SSID (name)
char pass[] = SECRET_PASS;    // your network password (use for WPA, or use as key for WEP)
int keyIndex = 0;             // your network key index number (needed only for WEP)
int status = WL_IDLE_STATUS;

// Initialize the Wifi client library
WiFiClient client;

// server address:
//char server[] = "jsonplaceholder.typicode.com"; // for public domain server
IPAddress server(172, 20, 10, 9); // for localhost server (server IP address can be found with ipconfig or ifconfig)

unsigned long lastConnectionTime = 0;
const unsigned long postingInterval = 10L * 50L; // delay between updates, in milliseconds (10L * 50L is around 1 second between requests)

// ******* START OF BME SENSOR SETUP ********
// EMG RMS
long computeRMS(long newVal) {        // function is used to smooth out values from EMG sensor
    if (newVal > 200000) newVal = 200000;
    emgRMS -= emgBuffer[emgIndex];
    emgBuffer[emgIndex] = newVal;
    emgRMS += newVal;
    emgIndex = (emgIndex + 1) % RMS_WINDOW;
    return emgRMS / RMS_WINDOW;
}

void setup() {
  // EMG Setup
  analogReference(AR_DEFAULT);
  analogReadResolution(12);
  myFilter.init(sampleRate, humFreq, true, true, true);
  Serial.begin(9600);
  delay(1000);

  for (int i = 0; i < 2000; i++) {          // repeats EMG collection multiple times per loop
      analogRead(SensorInputPin);
      int Value = analogRead(SensorInputPin);
      myFilter.update(Value - 3700);
      delayMicroseconds(2000);
  }

  // Flex Setup
  pinMode(FLEX_PIN, INPUT);     // gathers data from flex
  // Setup Notification
  Serial.println("CTS Master Sensor Code");
  Serial.println("EMG ready. Flex sensor ready.");
  windowStart = millis();
 // ********** END OF BME SENSOR SETUP *********

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
// ******** START OF BME CODE + MODEL *********
    // EMG Data
    analogRead(SensorInputPin);
    int emgRet = analogRead(SensorInputPin);
    int centered  = emgRet - 3700;           // clears out extra noise
    int filtered  = myFilter.update(centered);
    long envelope = (long)filtered * filtered;
    long smoothed = computeRMS(envelope);

    if (smoothed < windowMin) windowMin = smoothed;
    if (smoothed > windowMax) windowMax = smoothed;

    // Flex Data
    int flexRaw = analogRead(FLEX_PIN);
    int flexPosition = 0;
    if (flexRaw < flexFlat - flexDead) {
        flexPosition = constrain(
            (int)((flexFlat - flexRaw) / (float)(flexFlat - flexForward) * 100.0),
            0, 100
        );
    } else if (flexRaw > flexFlat + flexDead) {
        flexPosition = constrain(
            (int)((flexRaw - flexFlat) / (float)(flexBackward - flexFlat) * 100.0),
            0, 100
        ) * -1;
    }

    const char* flexDirection;
    const char* flexBend;

    if (flexPosition > flexDead) {   // uses positive and negative raw values to determine flexion/extension and assigns a value to the returnValue to be used in the math model
        flexDirection = "FORWARD";
        if (flexPosition < 40) { flexBend = "Slight";   returnValue = 1; }
        else if (flexPosition < 75) { flexBend = "Moderate"; returnValue = 2; }
        else { flexBend = "Full";      returnValue = 3; }
    } else if (flexPosition < -flexDead) {    // different values are used for backwards because backwards movement is more strenuous
        flexDirection = "BACKWARD";
        if (flexPosition > -30) { flexBend = "Slight";   returnValue = 1; }
        else if (flexPosition > -55) { flexBend = "Moderate"; returnValue = 2; }
        else { flexBend = "Full";      returnValue = 3; }
    } else {
        flexDirection = "FLAT";
        flexBend      = "";
        returnValue    = 0;
    }

    unsigned long now = millis();
    if (now - windowStart >= emgWindow) {
        float pct = 0.0f;
        if (windowMin > 0) {
            pct = ((float)(windowMax - windowMin) / (float)windowMin) * 100.0f;
            if (pct >= emgHigh) level = 3;
            else if (pct >= emgMedium) level = 2;
            else if (pct >= emgLow)  level = 1;
            else level = 0;
        }

        Serial.println("EMG SENSOR");
        Serial.print("min: " + String(windowMin)); 
        Serial.print("  max: " + String(windowMax)); 
        Serial.print("  spread: " + String(pct) + "1"); 
        String contraction = level == 0 ? "No contraction" : level == 1 ? "Low" : level == 2 ? "Medium" : level == 3 ? "High"
        Serial.println("% -> " + contraction);
        Serial.println("FLEX SENSOR");
        Serial.print("Raw: " + String(flexRaw));
        Serial.print("Position: " + String(flexPosition)); 
        Serial.print("Direction: " + String(flexDirection)); 
        Serial.print("Bend: " + String(flexBend)); 
        Serial.print("# Value: " + String(returnValue)); 

        // Math model
        emgMM[historyIndex]  = level;
        flexMM[historyIndex] = returnValue;
        historyIndex = (historyIndex + 1) % 3;      // resets array every 3 loops 
        if (historyIndex == 0) historyFull = true;  

        int combinedScore = 0;
        bool emgCounter  = false;
        bool flexCounter = false;

        if (historyFull) {    // compares 3 stored values to the threshold after 3 trials
            int emgSum  = emgMM[0]  + emgMM[1]  + emgMM[2];
            int flexSum = flexMM[0] + flexMM[1] + flexMM[2];
            if (emgSum  >= valueThreshold) { combinedScore += emgSum;  emgCounter  = true; }
            if (flexSum >= valueThreshold) { combinedScore += flexSum; flexCounter = true; }

            ctsCounter += combinedScore;
        }

        if (ctsCounter >= ctsThreshold) ctsRisk = true;

        Serial.println("MATH MODEL");
        Serial.print("EMG sum: " + String(emgMM[0] + emgMM[1] + emgMM[2]));
        Serial.println("Flex sum: " + String(flexMM[0] + flexMM[1] + flexMM[2]));
        Serial.print("Combined Score: " + String(combinedScore));
        Serial.print("    Counter: " + String(ctsCounter));
        Serial.print("    CTS Risk: ");   
        Serial.println(ctsRisk ? "TRUE" : "false");
        Serial.println();

        windowMin = LONG_MAX;
        windowMax = 0;
        windowStart = now;
    }
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
    String request = "GET /data?flex=" + String(flexPosition) + "&emg=" + String(pct) + "&flexHigh=" + String(flexSum) + "&emgHigh=" + String(emgSum) + " HTTP/1.1";
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