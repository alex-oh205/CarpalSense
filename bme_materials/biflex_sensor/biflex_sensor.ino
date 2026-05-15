
// --- Pin & circuit ---
const int   FLEX_PIN = A6;
const float VCC      = 3.3;
const float R_DIV    = 47000.0;

// --- Calibration ---
// To calibrate:
//   1. Hold sensor completely flat  → note raw, set rawFlat
//   2. Bend fully FORWARD (normal)  → note raw, set rawForward
//   3. Bend fully BACKWARD          → note raw, set rawBackward
int rawFlat     = 550;  // Resting flat value
int rawForward  = 420;  // Raw when fully bent forward 
int rawBackward = 610;  // Raw when fully bent backward

const int DEADZONE = 2;
int returnValue = 0;

void setup() {
  Serial.begin(9600);
  pinMode(FLEX_PIN, INPUT);
  Serial.println("=== Bidirectional Flex Sensor (single sensor) ===");
  Serial.println("Raw | Voltage | Resistance | Position | Direction | Zone");
}

void loop() {

  // 1. Read raw ADC
  int raw = analogRead(FLEX_PIN);

  // 2. Voltage
  float voltage = raw * (VCC / 1023.0);

  // 3. Resistance
  float resistance = 0;
  if (voltage > 0) {
    resistance = R_DIV * (VCC / voltage - 1.0);
  }

  // 4. Compute signed position (-100 to +100)
  //      positive = forward bend
  //      negative = backward bend
  //      0        = flat
  int position = 0;
  if (raw < rawFlat - DEADZONE) {
    // Raw dropped below flat → bending FORWARD
    position = constrain(
      (int)((rawFlat - raw) / (float)(rawFlat - rawForward) * 100.0),
      0, 100
    );
  } else if (raw > rawFlat + DEADZONE) {
    // Raw rose above flat → bending BACKWARD
    position = constrain(
      (int)((raw - rawFlat) / (float)(rawBackward - rawFlat) * 100.0),
      0, 100
    ) * -1;  // Negative = backward
  }

  // 5. Classify direction and zone
  const char* direction;
  const char* zone;

  if (position > DEADZONE) {
    direction = "FORWARD";
    if      (position < 40) {
      zone = "Slight";
      returnValue = 1;
    } else if (position < 75) {
      zone = "Moderate"; 
      returnValue = 2;
    } else                    {
      zone = "Full";
      returnValue = 3; }
  } else if (position < -DEADZONE) {
    direction = "BACKWARD";
    if      (position > -30) {
      zone = "Slight";
      returnValue = 1;
    } else if (position > -55) {
      zone = "Moderate";
      returnValue = 2;
    } else {                     
      zone = "Full";
      returnValue = 3; }
  } else {
    direction = "FLAT";
    zone = "";
  }

  // 6. Print
  Serial.println("=======FLEX SENSOR=======");
  Serial.print(raw);
  Serial.print(" | ");
  Serial.print(voltage, 2);
  Serial.print("V | ");
  Serial.print(resistance / 1000.0, 1);
  Serial.print("KΩ | ");
  Serial.print(position);       // -100 (full back) → 0 (flat) → +100 (full forward)
  Serial.print(" | ");
  Serial.print(direction);
  Serial.print(" ");
  Serial.print(zone);
  Serial.print("| ");
  Serial.println(returnValue);


  delay(1000);
}
