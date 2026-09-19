/**
 * =========================================================================================
 * STANDALONE MAX3010X I2C SCANNER DIAGNOSTIC SKETCH
 * =========================================================================================
 * Hardware Configuration:
 *   - Microcontroller : ESP32 DevKit V1
 *   - SDA Pin         : GPIO 21
 *   - SCL Pin         : GPIO 22
 *   - I2C Clock       : 100 kHz
 *   - Expected Address: 0x57 (MAX30100 / MAX30102 Pulse Oximeter & Heart Rate Sensor)
 * =========================================================================================
 */

#include <Wire.h>

#define I2C_SDA 21
#define I2C_SCL 22
#define I2C_CLOCK 100000
#define MAX3010X_ADDR 0x57

int scanCount = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("       ESP32 MAX3010X I2C BUS DIAGNOSTIC SCANNER       ");
  Serial.printf("  Hardware  : ESP32 | SDA: GPIO %d | SCL: GPIO %d\n", I2C_SDA, I2C_SCL);
  Serial.printf("  I2C Clock : 100 kHz | Expected Address: 0x%02X\n", MAX3010X_ADDR);
  Serial.println("  Wiring    : VIN -> 3.3V | GND -> GND | SCL -> 22 | SDA -> 21");
  Serial.println("=======================================================");

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_CLOCK);
  Wire.setTimeOut(50);
}

void loop() {
  scanCount++;
  byte error, address;
  int nDevices = 0;
  bool maxFound = false;

  Serial.printf("\n--- [Scan #%d] Starting I2C Scan (0x01 to 0x7F) ---\n", scanCount);

  for (address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();

    if (error == 0) {
      Serial.printf("[FOUND] Device responding at address 0x%02X", address);

      if (address == MAX3010X_ADDR) {
        Serial.print("  <-- *** [CONFIRMED] MAX30100 / MAX30102 SENSOR DETECTED! ***");
        maxFound = true;
      }

      Serial.println();
      nDevices++;
    } else if (error == 4) {
      Serial.printf("[ERROR] Unknown hardware error at address 0x%02X\n", address);
    }
  }

  Serial.println("-------------------------------------------------------");
  if (nDevices == 0) {
    Serial.println("[RESULT] No I2C devices responded on SDA=21, SCL=22.");
    Serial.println("Troubleshooting Checklist:");
    Serial.println("  1. Verify VIN is connected to ESP32 3.3V.");
    Serial.println("  2. Verify GND is connected to ESP32 GND.");
    Serial.println("  3. Verify SDA is connected to GPIO 21.");
    Serial.println("  4. Verify SCL is connected to GPIO 22.");
    Serial.println("  5. Check for loose Dupont jumper wires or breadboard contacts.");
  } else {
    Serial.printf("[RESULT] Scan complete: %d device(s) found.\n", nDevices);
    if (maxFound) {
      Serial.println(">>> SUCCESS: MAX30100/MAX30102 is active and communicating properly! <<<");
    } else {
      Serial.println(">>> NOTICE: Devices found, but 0x57 (MAX3010x) was not among them. <<<");
    }
  }
  Serial.println("Waiting 3 seconds for next scan...\n");

  delay(3000);
}
