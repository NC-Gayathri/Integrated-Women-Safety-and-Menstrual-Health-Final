/**
 * =========================================================================================
 * MAX30100 BASIC I2C TEST SKETCH
 * =========================================================================================
 * Hardware Configuration:
 *   - Microcontroller : ESP32 DevKit V1
 *   - Target Module   : MAX30100
 *   - Power           : VIN -> ESP32 3.3V, GND -> ESP32 GND
 *   - I2C Pins        : SDA -> GPIO 19, SCL -> GPIO 18
 *   - INT, IRD, RD    : Disconnected
 *   - Target Address  : 0x57
 *   - I2C Frequency   : 100000 Hz
 *   - Wire Timeout    : 1000 ms
 * =========================================================================================
 */

#include <Wire.h>

#define I2C_SDA 19
#define I2C_SCL 18
#define I2C_CLOCK 100000
#define I2C_TIMEOUT_MS 1000
#define TARGET_ADDR 0x57
#define TOTAL_PROBES 10

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("              MAX30100 BASIC I2C TEST                  ");
  Serial.printf("  Hardware: ESP32 | SDA: GPIO %d | SCL: GPIO %d\n", I2C_SDA, I2C_SCL);
  Serial.printf("  Target I2C Address: 0x%02X | Clock: %d Hz\n", TARGET_ADDR, I2C_CLOCK);
  Serial.printf("  Wire Timeout: %d ms | Total Probes: %d\n", I2C_TIMEOUT_MS, TOTAL_PROBES);
  Serial.println("=======================================================\n");

  // Configure SDA and SCL with internal pull-up before Wire.begin
  pinMode(I2C_SDA, INPUT_PULLUP);
  pinMode(I2C_SCL, INPUT_PULLUP);
  delay(10);

  // Initialize Wire
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_CLOCK);
  Wire.setTimeOut(I2C_TIMEOUT_MS);

  int ackCount = 0;
  int nackCount = 0;

  for (int i = 1; i <= TOTAL_PROBES; i++) {
    Wire.beginTransmission(TARGET_ADDR);
    byte err = Wire.endTransmission();

    if (err == 0) {
      ackCount++;
      Serial.printf("Probe %d: ACK (error code: %d)\n", i, err);
    } else {
      nackCount++;
      Serial.printf("Probe %d: NACK (error code: %d)\n", i, err);
    }

    if (i < TOTAL_PROBES) {
      delay(300); // 300 ms delay between probes
    }
  }

  Serial.println("\n-------------------------------------------------------");
  Serial.println("SUMMARY:");
  Serial.printf("ACK count: %d/%d\n", ackCount, TOTAL_PROBES);
  Serial.printf("NACK count: %d/%d\n", nackCount, TOTAL_PROBES);
  Serial.println("-------------------------------------------------------");
  Serial.println("TEST COMPLETED.");
}

void loop() {
  // Stop / idle after the 10 probes
  delay(1000);
}
