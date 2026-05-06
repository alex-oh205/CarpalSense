/*
 * ============================================================
 *  Wrist EMG Signal Detector — SEN0240 + Arduino Nano 33 IoT
 * ============================================================
 *
 * Detects electrical signals (sEMG) from wrist/forearm muscles
 * using the DFRobot SEN0240 Analog EMG Sensor by OYMotion.
 *
 * Features:
 *   • EMGFilters band-pass + notch filter (removes 50Hz mains hum)
 *   • Auto-calibration on startup (baseline noise floor)
 *   • Envelope (signal strength) calculation
 *   • Contraction detection with hold time
 *   • Contraction counter
 *   • Contraction strength level (LOW / MEDIUM / HIGH)
 *   • Serial Plotter friendly output

 * Serial Monitor: 115200 baud
 * Serial Plotter: shows envelope + threshold line for easy tuning
 * ============================================================
 */

#include <EMGFilters.h>

// ── Pin ───────────────────────────────────────────────────────────────────────
#define EMG_PIN  A5   // Avoid A0 on Nano 33 IoT (shared with IMU)

// ── Sampling ──────────────────────────────────────────────────────────────────
// EMGFilters supports SAMPLE_FREQ_500HZ or SAMPLE_FREQ_1000HZ only
#define SAMPLE_RATE  SAMPLE_FREQ_1000HZ   // 1000 samples/second
#define SAMPLE_PERIOD_US  1000            // microseconds between samples (1000Hz)

// ── Mains hum filter ─────────────────────────────────────────────────────────
// 50Hz  — Europe, Asia, Africa, Australia
// 60Hz  — USA, Canada, most of the Americas
#define HUM_FREQ  NOTCH_FREQ_50HZ   // Change to NOTCH_FREQ_60HZ if in USA/Canada

// ── Contraction detection ─────────────────────────────────────────────────────
// After calibration, set Threshold to the maximum envelope value
// recorded while your muscles are RELAXED, then add ~100 as headroom.
// Default 0 = calibration mode (prints raw envelope, no detection).
static int Threshold = 0;

// How many consecutive samples above threshold = confirmed contraction
const int  CONFIRM_SAMPLES  = 5;
// How many ms to hold "contracted" state after signal drops below threshold
const unsigned long HOLD_MS = 300;

// Strength levels (tune after calibration)
const int LEVEL_MED  = 200;   // envelope above this = MEDIUM
const int LEVEL_HIGH = 500;   // envelope above this = HIGH

// ── State ─────────────────────────────────────────────────────────────────────
EMGFilters  myFilter;
int         envelope          = 0;
bool        isContracted       = false;
int         confirmCount       = 0;
int         contractionCount   = 0;
unsigned long lastAboveTime    = 0;

// Timing
unsigned long lastSampleTime   = 0;
unsigned long lastPrintTime    = 0;
const unsigned long PRINT_MS   = 20;  // 50 Hz print rate to Serial

// Calibration
bool    calibrationDone    = false;
int     calibMaxEnvelope   = 0;
unsigned long calibStart   = 0;
const unsigned long CALIB_DURATION_MS = 5000;  // 5 s calibration window

// ─────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  while (!Serial);

  myFilter.init(SAMPLE_RATE, HUM_FREQ, true, true, true);

  Serial.println("========================================");
  Serial.println("  Wrist EMG Detector — SEN0240");
  Serial.println("========================================");

  if (Threshold == 0) {
    Serial.println("CALIBRATION MODE");
    Serial.println("Completely relax your wrist/forearm.");
    Serial.println("Recording baseline noise for 5 seconds...");
    Serial.println("----------------------------------------");
    calibStart = millis();
  } else {
    calibrationDone = true;
    Serial.print("Threshold set to: "); Serial.println(Threshold);
    Serial.println("Contraction detection ACTIVE.");
    Serial.println("Serial Plotter columns: Envelope | Threshold");
    Serial.println("========================================");
  }

  lastSampleTime = micros();
}

// ─────────────────────────────────────────────────────────────────────────────

void loop() {
  // ── Strict 1000 Hz sampling ──────────────────────────────────────────────
  unsigned long now = micros();
  if ((now - lastSampleTime) < SAMPLE_PERIOD_US) return;
  lastSampleTime = now;

  // ── Read & filter ────────────────────────────────────────────────────────
  int raw = analogRead(EMG_PIN);
  int filtered = myFilter.update(raw);

  // Envelope = square of filtered signal (signal energy / strength)
  int sq = filtered * filtered;
  // Smooth envelope with a simple IIR low-pass
  envelope = (envelope * 7 + sq) / 8;

  unsigned long nowMs = millis();

  // ── Calibration mode ────────────────────────────────────────────────────
  if (!calibrationDone) {
    if (envelope > calibMaxEnvelope) calibMaxEnvelope = envelope;

    // Print live envelope so user can watch it
    if ((nowMs - lastPrintTime) >= PRINT_MS) {
      lastPrintTime = nowMs;
      Serial.print("Envelope (relax!): ");
      Serial.println(envelope);
    }

    // After calibration window, report result
    if ((nowMs - calibStart) >= CALIB_DURATION_MS) {
      calibrationDone = true;
      int recommended = calibMaxEnvelope + 100;
      Serial.println("========================================");
      Serial.println("CALIBRATION COMPLETE");
      Serial.print("  Max baseline envelope : "); Serial.println(calibMaxEnvelope);
      Serial.print("  Recommended Threshold : "); Serial.println(recommended);
      Serial.println("----------------------------------------");
      Serial.println("Set  'static int Threshold = <value>;'");
      Serial.println("to the recommended value above, then");
      Serial.println("re-upload the sketch.");
      Serial.println("========================================");
    }
    return;
    delay(1000);
  }

  // ── Contraction detection ────────────────────────────────────────────────
  if (envelope > Threshold) {
    lastAboveTime = nowMs;
    confirmCount++;
    if (confirmCount >= CONFIRM_SAMPLES && !isContracted) {
      isContracted = true;
      contractionCount++;
      printContractionEvent();
    }
  } else {
    confirmCount = 0;
    // Hold the contracted state briefly to avoid flickering
    if (isContracted && (nowMs - lastAboveTime) > HOLD_MS) {
      isContracted = false;
    }
  }

  // ── Serial Plotter output (50 Hz) ────────────────────────────────────────
  // Columns: Envelope, Threshold (flat line for reference)
  if ((nowMs - lastPrintTime) >= PRINT_MS) {
    lastPrintTime = nowMs;
    Serial.print(envelope);
    Serial.print(" ");
    Serial.println(Threshold);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prints a contraction event to Serial Monitor with strength level
// ─────────────────────────────────────────────────────────────────────────────
void printContractionEvent() {
  const char* level;
  if      (envelope >= LEVEL_HIGH) level = "HIGH";
  else if (envelope >= LEVEL_MED)  level = "MEDIUM";
  else                              level = "LOW";

  Serial.print(">>> CONTRACTION #");
  Serial.print(contractionCount);
  Serial.print("  |  Envelope: ");
  Serial.print(envelope);
  Serial.print("  |  Strength: ");
  Serial.println(level);
}
