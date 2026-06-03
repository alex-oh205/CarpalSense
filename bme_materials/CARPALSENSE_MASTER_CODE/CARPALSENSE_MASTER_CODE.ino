//  SECTION 1: LIBRARIES AND VARIABLES

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
int flexForward = 400;  // fully bent forward
int flexBackward = 600;  // fully bent backward

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


//  SECTION 2: SENSOR CODE
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
}

void loop() {

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
        Serial.print("% ->  ");
        switch (level) {
            case 0: Serial.println("No Contraction"); break;
            case 1: Serial.println("Low"); break;
            case 2: Serial.println("Medium"); break;
            case 3: Serial.println("High"); break;
            default: Serial.println("Error"); break;
        }
        Serial.println("FLEX SENSOR");
        Serial.print("Raw: " + String(flexRaw));
        Serial.print(" | " + String(flexPosition)); 
        Serial.print(" | " + String(flexDirection)); 
        Serial.print(" | Bend: " + String(flexBend)); 
        Serial.println(" | Filter Value: " + String(returnValue)); 

        // Math model
        emgMM[historyIndex]  = level;
        flexMM[historyIndex] = returnValue;
        historyIndex = (historyIndex + 1) % 3;      // resets array every 3 loops 
        if (historyIndex == 0) historyFull = true;  

        int combinedScore = 0;
        bool emgCounter  = false;
        bool flexCounter = false;

        if (historyFull && historyIndex == 0) {    // compares 3 stored values to the threshold after 3 trials
            int emgSum  = emgMM[0]  + emgMM[1]  + emgMM[2];
            int flexSum = flexMM[0] + flexMM[1] + flexMM[2];
            if (emgSum  >= valueThreshold) { combinedScore += emgSum;  emgCounter  = true; }
            if (flexSum >= valueThreshold) { combinedScore += flexSum; flexCounter = true; }

            ctsCounter += combinedScore;
        }

        if (ctsCounter >= ctsThreshold) ctsRisk = true;

        Serial.println("MATH MODEL");
        Serial.print("EMG  last 3 sum: "); Serial.print(emgMM[0] + emgMM[1] + emgMM[2]);
        Serial.print("  passed: ");        Serial.println(emgCounter  ? "YES" : "NO");
        Serial.print("Flex last 3 sum: "); Serial.print(flexMM[0] + flexMM[1] + flexMM[2]);
        Serial.print("  passed: ");        Serial.println(flexCounter ? "YES" : "NO");
        Serial.print("Combined Score: ");  Serial.print(combinedScore);
        Serial.print("  |  Counter: ");    Serial.print(ctsCounter);
        Serial.print("  |  CTS Risk: ");   Serial.println(ctsRisk ? "TRUE" : "false");
        Serial.println();
        
        windowMin = LONG_MAX;
        windowMax = 0;
        windowStart = now;
    }
}