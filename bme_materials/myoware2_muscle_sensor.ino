// --- Pin & power constants ---
const int   ENV_PIN  = A0;       // ENV output
const float VCC      = 3.3;     

// Calibration
const int THRESH_SLIGHT   = 260;  // ADC value for slight activation
const int THRESH_MODERATE = 270;  // ADC value for moderate activation
const int THRESH_STRONG   = 275;  // ADC value for strong activation

// Smoothing
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

  // --- 4. Translation
  const char* activation;
  if      (smoothed < THRESH_SLIGHT)   activation = "Rest";
  else if (smoothed < THRESH_MODERATE) activation = "Slight";
  else if (smoothed < THRESH_STRONG)   activation = "Moderate";
  else                                 activation = "STRONG";

  // --- 5. Print
  Serial.print(raw);
  Serial.print(" | ");
  Serial.print(smoothed);
  Serial.print("    | ");
  Serial.print(voltage, 2);
  Serial.print("V   | ");
  Serial.println(activation);

  delay(200); // ~20 readings per second
}