// Constants
const int   FLEX_PIN    = A6;       // Data Output
const float VCC         = 3.3;      // Voltage Input
const float R_DIV       = 47000.0;  // 47KΩ divider resistor

// Resistance Range
const float R_FLAT = 25000.0;   // ~25KΩ; unflexed
const float R_BENT = 100000.0;  // ~100KΩ; fully bent

// Calibration
int rawFlat = 19;  // Reading when fully flat
int rawBent = 9;  // Reading when fully bent

void setup() {
  Serial.begin(9600);
  pinMode(FLEX_PIN, INPUT);
  Serial.println("Adafruit Short Flex Sensor");
  Serial.println("Raw | Voltage | Resistance | Bend% | Zone");
}

void loop() {

  // 1. Read raw ADC (0–1023)
  int raw = analogRead(FLEX_PIN);

  // 2. Convert to voltage
  float voltage = raw * (VCC / 1023.0);

  // 3. Solve voltage divider for flex resistance
  float resistance = 0;
  if (voltage > 0) {
    resistance = R_DIV * (VCC / voltage - 1.0);
  }

  // 4. Map raw ADC to 0–100% bend
  float bend = constrain((raw - rawFlat) / (float)(rawBent - rawFlat) * 100.0, 0.0, 100.0);

  // 5. Translation 
  const char* zone;
  if      (bend < 20) zone = "Flat";
  else if (bend < 50) zone = "Slight";
  else if (bend < 80) zone = "Moderate";
  else                zone = "Full";

  // 6. Print
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
