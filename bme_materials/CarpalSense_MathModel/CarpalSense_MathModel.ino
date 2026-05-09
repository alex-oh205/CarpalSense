// ============================================================
// CarpalSense — Full Integrated Math Model
// Arduino Nano 33 IoT
//
// SENSORS:
//   Flex sensor → A6
//   EMG sensor  → A5
//
// OUTPUT:
//   Serial Monitor only (no buzzer)
//
// WHAT THIS DOES:
//   1. Reads flex sensor → converts to 0-3 score
//   2. Calibrates EMG baseline on startup (30 seconds)
//   3. Reads EMG sensor → converts to 0-3 score
//   4. Combines both into Cumulative Strain Score (CSS)
//   5. Prints full dashboard to Serial Monitor every second
//
// SCIENTIFIC BASIS:
//   Flex thresholds: 25mmHg carpal tunnel pressure research
//     Forward (flexion)  danger at 38° → position ~+65
//     Backward (extension) danger at 27° → position ~-50
//   EMG thresholds: intramuscular pressure research
//     4x resting baseline ≈ 25% MVC ≈ 21mmHg pressure
//   CSS weights: force (EMG) weighted higher than posture (flex)
//     based on pooled study of 2,474 workers
//   CSS thresholds: Revised Strain Index clinical research
//     Safe < 8.5, Caution 8.5-15, Warning 15-20, Danger > 20
// ============================================================


// ============================================================
// FLEX SENSOR SETUP
// Copied directly from your existing code
// ============================================================
const int   FLEX_PIN    = A6;
const float VCC         = 3.3;
const float R_DIV       = 47000.0;

// Your calibrated raw values — keep these as they are
int rawFlat     = 22;
int rawForward  = 7;
int rawBackward = 40;

const int DEADZONE = 2;

// ------------------------------------------------------------
// FLEX POSITION THRESHOLDS
// These are in "position" units (-100 to +100) from your code
//
// FORWARD  = wrist flexion  (danger at 38°)
// BACKWARD = wrist extension (danger at 27°)
//
// Your position scale goes 0 to 100 for full bend.
// 38° flexion is roughly 65% of your full forward range.
// 27° extension is roughly 50% of your full backward range.
//
// So in position units:
//   Forward  warn    = +40   (approaching 38° flexion)
//   Forward  danger  = +65   (at 38° flexion)
//   Backward warn    = -35   (approaching 27° extension)
//   Backward danger  = -50   (at 27° extension)
//
// IF THESE FEEL WRONG after testing, adjust them here.
// ------------------------------------------------------------
const int FLEX_FWD_WARN    =  40;
const int FLEX_FWD_DANGER  =  65;
const int FLEX_BWD_WARN    = -35;
const int FLEX_BWD_DANGER  = -50;


// ============================================================
// EMG SENSOR SETUP
// ============================================================
const int EMG_PIN = A5;

// Calibration
const int CALIBRATION_SECONDS = 30;
float     emgBaseline         = 0.0;
bool      calibrated          = false;

// EMG ratio thresholds (multiples of resting baseline)
// 2x = light sustained effort  (~5% MVC)
// 3x = moderate effort         (~10-15% MVC)
// 4x = high effort             (~20-25% MVC)
//      Research: 25% MVC produces 21mmHg intramuscular pressure
//      approaching your 25mmHg clinical CTS threshold
const float EMG_LEVEL_1 = 2.0;
const float EMG_LEVEL_2 = 3.0;
const float EMG_LEVEL_3 = 4.0;


// ============================================================
// CSS (CUMULATIVE STRAIN SCORE) SETUP
// Thresholds from Revised Strain Index clinical research
// validated on 1,372 workers followed for up to 6 years
// ============================================================
float css = 0.0;

const float CSS_CAUTION  =  8.5;
const float CSS_WARNING  = 15.0;
const float CSS_DANGER   = 20.0;

// Weights — EMG carries more weight than flex
// Scientific basis: forceful exertion is a stronger
// independent predictor of CTS than wrist posture alone
const float EMG_WEIGHT   = 0.6;
const float FLEX_WEIGHT  = 0.4;

// Recovery rate when both sensors read 0
// Muscles recover slowly — not instant
const float RECOVERY_RATE = 0.1;


// ============================================================
// TIMING
// ============================================================
unsigned long previousMillis = 0;
const long    INTERVAL       = 1000; // update every 1 second


// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(9600);
  while (!Serial);

  pinMode(FLEX_PIN, INPUT);

  Serial.println("============================================");
  Serial.println("        CarpalSense Starting Up            ");
  Serial.println("============================================");

  // Run EMG calibration before anything else
  calibrateEMG();
}


// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= INTERVAL) {
    previousMillis = currentMillis;

    // 1. Get flex position and score
    int flexPosition = getFlexPosition();
    int flexScore    = getFlexScore(flexPosition);

    // 2. Get EMG score
    int emgScore = getEMGScore();

    // 3. Update CSS
    updateCSS(flexScore, emgScore);

    // 4. Print full dashboard
    printDashboard(flexScore, emgScore, flexPosition);
  }
}


// ============================================================
// EMG CALIBRATION
// Runs once on startup for 30 seconds.
// User must rest hand flat on desk doing nothing.
// Averages thousands of readings for accurate baseline.
// ============================================================
void calibrateEMG() {
  Serial.println("CALIBRATION STARTING IN 3 SECONDS...");
  Serial.println("Rest your hand flat on the desk. Do not move.");
  delay(3000);
  Serial.println("Calibrating...");

  long  total      = 0;
  int   samples    = 0;
  int   lastPrint  = 0;
  unsigned long startTime = millis();

  while (millis() - startTime < (CALIBRATION_SECONDS * 1000UL)) {
    total += analogRead(EMG_PIN);
    samples++;

    int elapsed = (millis() - startTime) / 1000;
    if (elapsed % 5 == 0 && elapsed != lastPrint && elapsed > 0) {
      Serial.print(CALIBRATION_SECONDS - elapsed);
      Serial.println(" seconds remaining...");
      lastPrint = elapsed;
    }
    delay(10);
  }

  emgBaseline = (float)total / samples;
  calibrated  = true;

  Serial.println("--------------------------------------------");
  Serial.print("Baseline set: ");
  Serial.println(emgBaseline, 1);
  Serial.println("Monitoring started.");
  Serial.println("============================================");
  Serial.println("Flex | EMG | CSS    | Risk");
  Serial.println("============================================");
}


// ============================================================
// FLEX POSITION
// Copied directly from your existing code.
// Returns -100 (full backward) to +100 (full forward)
// ============================================================
int getFlexPosition() {
  int   raw     = analogRead(FLEX_PIN);
  float voltage = raw * (VCC / 1023.0);
  float resistance = 0;

  if (voltage > 0) {
    resistance = R_DIV * (VCC / voltage - 1.0);
  }

  int position = 0;

  if (raw < rawFlat - DEADZONE) {
    // Bending FORWARD (flexion)
    position = constrain(
      (int)((rawFlat - raw) / (float)(rawFlat - rawForward) * 100.0),
      0, 100
    );
  } else if (raw > rawFlat + DEADZONE) {
    // Bending BACKWARD (extension)
    position = constrain(
      (int)((raw - rawFlat) / (float)(rawBackward - rawFlat) * 100.0),
      0, 100
    ) * -1;
  }

  return position;
}


// ============================================================
// FLEX SCORE (0-3)
// Converts position (-100 to +100) into risk score.
//
// Score meaning:
//   0 = neutral, no risk
//   1 = slight bend, minor risk
//   2 = moderate bend, approaching clinical danger angle
//   3 = severe bend, past clinical danger angle
//
// Clinical basis (25mmHg threshold):
//   Flexion danger at 38°   → mapped to position +65
//   Extension danger at 27° → mapped to position -50
// ============================================================
int getFlexScore(int position) {

  // Forward = wrist flexion
  if (position > DEADZONE) {
    if (position >= FLEX_FWD_DANGER) return 3;
    if (position >= FLEX_FWD_WARN)   return 2;
    return 1;
  }

  // Backward = wrist extension
  if (position < -DEADZONE) {
    if (position <= FLEX_BWD_DANGER) return 3;
    if (position <= FLEX_BWD_WARN)   return 2;
    return 1;
  }

  // Neutral
  return 0;
}


// ============================================================
// EMG SCORE (0-3)
// Compares current reading to resting baseline.
//
// Score meaning:
//   0 = at or below baseline (resting)
//   1 = 2x baseline, light sustained effort (~5% MVC)
//   2 = 3x baseline, moderate effort (~10-15% MVC)
//   3 = 4x+ baseline, high effort (~20-25% MVC)
//       At 25% MVC intramuscular pressure reaches 21mmHg
//       approaching your 25mmHg clinical CTS threshold
// ============================================================
int getEMGScore() {
  if (!calibrated) return 0;

  float raw   = analogRead(EMG_PIN);
  float ratio = raw / emgBaseline;

  if (ratio >= EMG_LEVEL_3) return 3;
  if (ratio >= EMG_LEVEL_2) return 2;
  if (ratio >= EMG_LEVEL_1) return 1;
  return 0;
}


// ============================================================
// UPDATE CSS
// Adds weighted sensor scores every second.
// Slowly recovers when both sensors read 0.
//
// Formula every second:
//   CSS += (emgScore x 0.6) + (flexScore x 0.4)
//
// Weight rationale:
//   EMG (force/effort) = stronger CTS predictor
//   Flex (posture)     = real but weaker predictor
//   Source: pooled biomechanical study of 2,474 workers
// ============================================================
void updateCSS(int flexScore, int emgScore) {
  if (flexScore == 0 && emgScore == 0) {
    // Both sensors clear — gradual recovery
    css -= RECOVERY_RATE;
    if (css < 0) css = 0;
  } else {
    float contribution = (emgScore * EMG_WEIGHT) + (flexScore * FLEX_WEIGHT);
    css += contribution;
  }
}


// ============================================================
// PRINT DASHBOARD
// Prints one clean row per second to Serial Monitor.
// Includes direction and zone from your original flex code.
// ============================================================
void printDashboard(int flexScore, int emgScore, int flexPosition) {

  // Flex direction label from your original code
  const char* direction;
  const char* zone;

  if (flexPosition > DEADZONE) {
    direction = "FORWARD ";
    if      (flexPosition < 30) zone = "Slight  ";
    else if (flexPosition < 65) zone = "Moderate";
    else                        zone = "Full    ";
  } else if (flexPosition < -DEADZONE) {
    direction = "BACKWARD";
    if      (flexPosition > -30) zone = "Slight  ";
    else if (flexPosition > -65) zone = "Moderate";
    else                         zone = "Full    ";
  } else {
    direction = "FLAT    ";
    zone      = "        ";
  }

  // Risk level from CSS thresholds
  const char* riskLevel;
  const char* message;

  if (css < CSS_CAUTION) {
    riskLevel = "SAFE   ";
    message   = "All clear.";
  } else if (css < CSS_WARNING) {
    riskLevel = "CAUTION";
    message   = "Strain accumulating. Take a break soon.";
  } else if (css < CSS_DANGER) {
    riskLevel = "WARNING";
    message   = "High strain. Stop and rest now.";
  } else {
    riskLevel = "DANGER ";
    message   = "STOP IMMEDIATELY. Serious CTS risk.";
  }

  // Print full row
  Serial.print("Flex:");
  Serial.print(flexScore);
  Serial.print(" (");
  Serial.print(direction);
  Serial.print(" ");
  Serial.print(zone);
  Serial.print(") | EMG:");
  Serial.print(emgScore);
  Serial.print(" | CSS:");
  Serial.print(css, 2);
  Serial.print(" | ");
  Serial.print(riskLevel);
  Serial.print(" | ");
  Serial.println(message);
}
