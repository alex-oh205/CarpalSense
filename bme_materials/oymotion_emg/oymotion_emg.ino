//Libraries
#if defined(ARDUINO) && ARDUINO >= 100
#include "Arduino.h"
#else
#include "WProgram.h"
#endif

#include <limits.h>   // provides LONG_MAX for window
#include "EMGFilters.h"

#define SensorInputPin A5
#define RMS_WINDOW 100

// Sensor Setup
long rmsBuffer[RMS_WINDOW] = {0};
int  rmsIndex = 0;
long rmsSum = 0;

static long Threshold = 2000;

long computeRMS(long newVal) {
    if (newVal > 200000) newVal = 200000;
    rmsSum -= rmsBuffer[rmsIndex];
    rmsBuffer[rmsIndex] = newVal;
    rmsSum += newVal;
    rmsIndex = (rmsIndex + 1) % RMS_WINDOW;
    return rmsSum / RMS_WINDOW;
}

//Sets up rate of collection and filters
EMGFilters myFilter;
SAMPLE_FREQUENCY sampleRate = SAMPLE_FREQ_500HZ;
NOTCH_FREQUENCY  humFreq    = NOTCH_FREQ_60HZ;

unsigned long timeStamp;
const unsigned long timeBudget = 2000;

//   Sets up a window for 1 second that will gather all data points over that period and use the percent change from highest vs lowest to determine contraction
//   WINDOW_MS       — length of each observation window in milliseconds
//   THRESH_LOW_PCT  — % spread to count as Low   contraction
//   THRESH_MED_PCT  — % spread to count as Medium contraction
//   THRESH_HIGH_PCT — % spread to count as High   contraction
// Percent spread = ((max - min) / min) * 100

const unsigned long WINDOW_MS       = 1000;
const float         THRESH_LOW_PCT  = 25.0f;
const float         THRESH_MED_PCT  = 50.0f;
const float         THRESH_HIGH_PCT = 75.0f;

unsigned long windowStart = 0;
long          windowMin   = LONG_MAX;
long          windowMax   = 0;

int   level = 0;
const char* levelLabel(int lvl) {
    switch (lvl) {
        case 0:  return "No Contraction";
        case 1:  return "Low";
        case 2:  return "Medium";
        case 3:  return "High";
        default: return "---";
    }
}

// Setup
void setup() {
    analogReference(AR_DEFAULT);
    analogReadResolution(12);
    myFilter.init(sampleRate, humFreq, true, true, true);
    Serial.begin(115200);
    delay(1000);

    for (int i = 0; i < 2000; i++) {
        analogRead(SensorInputPin);
        int Value = analogRead(SensorInputPin);
        myFilter.update(Value - 3700);
        delayMicroseconds(2000);
    }

    Serial.println("Start");
    windowStart = millis();
}

 
void loop() {
    timeStamp = micros();

    // ── Data Collection
    analogRead(SensorInputPin);
    int Value     = analogRead(SensorInputPin);
    int centered  = Value - 3700;
    int filtered  = myFilter.update(centered);
    long envelope = (long)filtered * filtered;
    long smoothed = computeRMS(envelope);

    // ── Track min and max within the current window 
    if (smoothed < windowMin) windowMin = smoothed;
    if (smoothed > windowMax) windowMax = smoothed;

    // Prints lowest, highest, and percentage change
    unsigned long now = millis();
    if (now - windowStart >= WINDOW_MS) {

        float pct   = 0.0f;

        if (windowMin > 0) {
            pct = ((float)(windowMax - windowMin) / (float)windowMin) * 100.0f;

            if      (pct >= THRESH_HIGH_PCT) level = 3;
            else if (pct >= THRESH_MED_PCT)  level = 2;
            else if (pct >= THRESH_LOW_PCT)  level = 1;
            else                             level = 0;
        }

        Serial.print("min: ");
        Serial.print(windowMin);
        Serial.print("  max: ");
        Serial.print(windowMax);
        Serial.print("  spread: ");
        Serial.print(pct, 1);
        Serial.print("%  ->  ");
        Serial.println(levelLabel(level));

        // Reset window
        windowMin   = LONG_MAX;
        windowMax   = 0;
        windowStart = now;
    }
}
