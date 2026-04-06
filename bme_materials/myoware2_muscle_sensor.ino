// ============================================================
//  SparkFun MyoWare 2.0 Muscle Sensor (EMG)
//
//  Wiring (direct wire — no Arduino Shield):
//    MyoWare VIN  → Arduino 5V  (or 3.3V — sensor supports both)
//    MyoWare GND  → Arduino GND
//    MyoWare ENV  → Arduino A0  (envelope output, 0–VIN)
//
//  Electrode placement:
//    END (E) snap  → electrode pad at one end of the muscle belly
//    MID (M) snap  → electrode pad at the middle of the muscle belly
//    REF (R) snap  → reference electrode on a bony/neutral area
//                    (e.g. elbow, wrist bone, collarbone)
//
//  If using the MyoWare 2.0 Arduino Shield, the ENV signal
//  is already routed to A0 automatically.
// ============================================================

// --- Pin & power constants ---
const int   ENV_PIN  = A0;       // ENV output from MyoWare
const float VCC      = 3.3;      // Match your board supply (5.0 or 3.3)

// --- Thresholds for muscle activation zones (tune to your body) ---
// Run the sketch first and observe raw values while flexing, then adjust.
const int THRESH_SLIGHT   = 260;  // ADC value for slight activation
const int THRESH_MODERATE = 270;  // ADC value for moderate activation
const int THRESH_STRONG   = 275;  // ADC value for strong activation

// --- Smoothing: simple moving average ---
const int  WINDOW_SIZE = 10;
int        readings[WINDOW_SIZE];
int        readIndex   = 0;
long       total       = 0;

void setup() {
  Serial.begin(9600);
  pinMode(ENV_PIN, INPUT);

  // Initialize smoothing buffer
  for (int i = 0; i < WINDOW_SIZE; i++) readings[i] = 0;

  Serial.println("=== SparkFun MyoWare 2.0 Muscle Sensor ===");
  Serial.println("Raw  | Smoothed | Voltage | Activation");
}

void loop() {

  // --- 1. Read raw ADC (0–1023) ---
  int raw = analogRead(ENV_PIN);

  // --- 2. Apply moving average to smooth noise ---
  total -= readings[readIndex];
  readings[readIndex] = raw;
  total += readings[readIndex];
  readIndex = (readIndex + 1) % WINDOW_SIZE;
  int smoothed = total / WINDOW_SIZE;

  // --- 3. Convert to voltage ---
  float voltage = smoothed * (VCC / 1023.0);

  // --- 4. Classify activation level ---
  const char* activation;
  if      (smoothed < THRESH_SLIGHT)   activation = "Rest";
  else if (smoothed < THRESH_MODERATE) activation = "Slight";
  else if (smoothed < THRESH_STRONG)   activation = "Moderate";
  else                                 activation = "STRONG";

  // --- 5. Print to Serial Monitor ---
  Serial.print(raw);
  Serial.print(" | ");
  Serial.print(smoothed);
  Serial.print("    | ");
  Serial.print(voltage, 2);
  Serial.print("V   | ");
  Serial.println(activation);

  delay(200); // ~20 readings per second
}


// ============================================================
//  BONUS: Threshold trigger — fires a digital output when
//  the muscle flexes above a set level. Useful for controlling
//  a relay, servo, or sending a signal to another device.
//  Connect your output device to pin 7.
//
//  Uncomment this loop() and comment out the one above to use.
// ============================================================

// const int  OUTPUT_PIN   = 7;
// const int  FLEX_TRIGGER = 500; // ADC threshold — adjust to taste
//
// void loop() {
//   int raw = analogRead(ENV_PIN);
//
//   // Smooth
//   total -= readings[readIndex];
//   readings[readIndex] = raw;
//   total += readings[readIndex];
//   readIndex = (readIndex + 1) % WINDOW_SIZE;
//   int smoothed = total / WINDOW_SIZE;
//
//   bool flexing = (smoothed > FLEX_TRIGGER);
//   digitalWrite(OUTPUT_PIN, flexing ? HIGH : LOW);
//
//   Serial.print("Smoothed: "); Serial.print(smoothed);
//   Serial.print(" | State: "); Serial.println(flexing ? "FLEXING" : "rest");
//   delay(50);
// }
