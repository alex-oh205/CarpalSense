// ============================================================
//  SECTION 1: LIBRARIES AND VARIABLES
// ============================================================

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
int flex_rawFlat     = 550;  // Resting flat value
int flex_rawForward  = 420;   // Raw when fully bent forward
int flex_rawBackward = 610;  // Raw when fully bent backward

const int flex_DEADZONE = 2;
int returnValue = 0;        // Flex sensor output: 0 (flat) to 3 (full bend)
int level = 0;             // EMG output: 0 (no contraction) to 3 (high contraction)


// --- EMG SENSOR: Pin & RMS Setup ---
#define SensorInputPin A5
#define RMS_WINDOW 100

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
const unsigned long emg_WINDOW_MS       = 1000;         // length of each observation window in milliseconds
const float         emg_THRESH_LOW_PCT  = 50.0f;
const float         emg_THRESH_MED_PCT  = 100.0f;
const float         emg_THRESH_HIGH_PCT = 200.0f;

unsigned long emg_windowStart = 0;
long          emg_windowMin   = LONG_MAX;
long          emg_windowMax   = 0;

// --- MATH MODEL: Counter & CTS Risk ---
long          ctsCounter             = 0;           // total weighted score
const long    CTS_THRESHOLD          = 500000;      // threshold to alert user of CTS risk
bool          ctsRisk                = false;

int           emg_history[3]         = {0, 0, 0};   // array of the last 3 readings for EMG
int           flex_history[3]        = {0, 0, 0};   // array of the last 3 readings for flex
int           historyIndex           = 0;
bool          historyFull            = false;
const int     SPIKE_FILTER_THRESHOLD = 4;           // minimum value of the combined three readings to filter out spikes


// ============================================================
//  SECTION 2: SENSOR CODE
// ============================================================

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

void setup() {
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
    // --- Setup Notification ---
    Serial.println("=== CTS Master Sensor Code ===");
    Serial.println("EMG ready. Flex sensor ready.");
    emg_windowStart = millis();
}

void loop() {

    // --- EMG Data Collection ---
    emg_timeStamp = micros();
    analogRead(SensorInputPin);
    int emg_Value = analogRead(SensorInputPin);
    int centered  = emg_Value - 3700;
    int filtered  = myFilter.update(centered);
    long envelope = (long)filtered * filtered;
    long smoothed = computeRMS(envelope);

    if (smoothed < emg_windowMin) emg_windowMin = smoothed;
    if (smoothed > emg_windowMax) emg_windowMax = smoothed;

    // --- Flex Data Collection ---
    int flex_raw = analogRead(FLEX_PIN);
    float flex_voltage    = flex_raw * (FLEX_VCC / 4095.0);  // fixed: 12-bit ADC
    float flex_resistance = 0;
    if (flex_voltage > 0) {
        flex_resistance = FLEX_R_DIV * (FLEX_VCC / flex_voltage - 1.0);
    }

    int flex_position = 0;
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

    if (flex_position > flex_DEADZONE) {            // Uses the positive and negative raw values to determine flexion/extension and assigns a value to the returnValue to be used in the math model
        flex_direction = "FORWARD";
        if      (flex_position < 40) { flex_zone = "Slight";   returnValue = 1; }
        else if (flex_position < 75) { flex_zone = "Moderate"; returnValue = 2; }
        else                         { flex_zone = "Full";      returnValue = 3; }
    } else if (flex_position < -flex_DEADZONE) {    // Different values are used for backwards because backwards movement is more strenuous
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
    if (now - emg_windowStart >= emg_WINDOW_MS) {

        float pct = 0.0f;
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

        int combinedScore = 0;
        bool emg_passed   = false;
        bool flex_passed  = false;

        if (historyFull) {
            int emg_sum  = emg_history[0]  + emg_history[1]  + emg_history[2];
            int flex_sum = flex_history[0] + flex_history[1] + flex_history[2];

            if (emg_sum  >= SPIKE_FILTER_THRESHOLD) { combinedScore += emg_sum;  emg_passed  = true; }
            if (flex_sum >= SPIKE_FILTER_THRESHOLD) { combinedScore += flex_sum; flex_passed = true; }

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
        emg_windowStart = now;
    }
}
