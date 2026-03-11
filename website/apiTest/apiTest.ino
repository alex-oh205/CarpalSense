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

// Define global variables and constants for the circuit & sensor
const int   FLEX_PIN    = A6;       // Data Output
const float VCC         = 3.3;      // Voltage Input
const float R_DIV       = 47000.0;  // 47KΩ divider resistor

// Resistance Range
const float R_FLAT = 25000.0;   // ~25KΩ; unflexed
const float R_BENT = 100000.0;  // ~100KΩ; fully bent

// Calibration; Adjust values based off positions
int rawFlat = 17;  // Reading when fully flat
int rawBent = 28;  // Reading when fully bent

//Percentage of Bending
float bend;

///////please enter your sensitive data in the Secret tab/arduino_secrets.h
char ssid[] = SECRET_SSID;    // your network SSID (name)
char pass[] = SECRET_PASS;    // your network password (use for WPA, or use as key for WEP)
int keyIndex = 0;             // your network key index number (needed only for WEP)
int status = WL_IDLE_STATUS;

// Initialize the Wifi client library
WiFiClient client;

// server address:
//char server[] = "jsonplaceholder.typicode.com"; // for public domain server
IPAddress server(10, 113, 61, 224); // for localhost server (server IP address can be found with ipconfig or ifconfig)

unsigned long lastConnectionTime = 0;
const unsigned long postingInterval = 10L * 50L; // delay between updates, in milliseconds (10L * 50L is around 1 second between requests)

void setup(){
  
  Serial.begin(9600);      //
  pinMode(FLEX_PIN, INPUT);
  Serial.println("Adafruit Short Flex Sensor");
  Serial.println("Raw | Voltage | Resistance | Bend% | Zone");

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

void loop(){

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

  // call range() function to get distance
  flex();  
  
  // if there's a successful connection:
  if (client.connect(server, 5000)) {
    Serial.println("connecting...");

    // send the HTTP GET request with the distance as a parameter.
    // The Flask route to call should be inbetween the "/" and "?" (ex:  GET /test?...
    // where "test" is the Flask route that will GET the data, "distance" is the key
    // and the value is provided by:  String(distance))
    String request = "GET /test?bend=" + String(bend) + " HTTP/1.1";
    client.println(request);

    // set the host as server IP address
    client.println("Host: 10.113.61.224");

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

// collect FlexSensor Values
void flex(){
  // 1. Read raw ADC (0–1023)
  int raw = analogRead(FLEX_PIN);

  // 2. Convert to voltage
  float voltage = raw * (VCC / 1023.0);

  // 3. Solve voltage divider for flex resistance
  //    Vout = VCC * R_DIV / (R_flex + R_DIV)
  float resistance = 0;
  if (voltage > 0) {
    resistance = R_DIV * (VCC / voltage - 1.0);
  }

  // 4. Map raw ADC to 0–100% bend
  bend = constrain((raw - rawFlat) / (float)(rawBent - rawFlat) * 100.0, 0.0, 100.0);
  
  // 5. Human-readable zone
  const char* zone;
  if      (bend < 20) zone = "Flat";
  else if (bend < 50) zone = "Slight";
  else if (bend < 80) zone = "Moderate";
  else                zone = "Full";
  // 6. Print results
  Serial.println("=======FLEX SENSOR=======");
  Serial.print(raw);
  Serial.print("|");
  Serial.print(voltage, 2);
  Serial.print("V|");
  Serial.print(resistance / 1000.0, 1);
  Serial.print("KΩ|");
  Serial.print((int)bend);
  Serial.print("%|");
  Serial.println(zone);
  delay(1000);
}
