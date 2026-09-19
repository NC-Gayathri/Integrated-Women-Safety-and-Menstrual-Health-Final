/**
 * =========================================================================================
 * MAX30100 SPECIFIC HARDWARE DIAGNOSTIC SKETCH
 * =========================================================================================
 * Hardware Configuration:
 *   - Microcontroller : ESP32 DevKit V1
 *   - Target Module   : MAX30100 Pulse Oximeter Module
 *   - Power           : VIN -> ESP32 3.3V, GND -> ESP32 GND
 *   - I2C Pins        : SDA -> GPIO 21, SCL -> GPIO 22
 *   - INT, IRD, RD    : Disconnected
 *   - I2C Address     : 0x57
 *   - I2C Frequency   : 100 kHz (100000 Hz)
 * =========================================================================================
 */

#include <Wire.h>

#define I2C_SDA 21
#define I2C_SCL 22
#define I2C_CLOCK 100000
#define MAX30100_ADDR 0x57

// Targeted MAX30100 Registers
#define REG_INT_STATUS   0x00
#define REG_MODE_CONFIG  0x06
#define REG_SPO2_CONFIG  0x07
#define REG_LED_CONFIG   0x09
#define REG_REVISION_ID  0xFE
#define REG_PART_ID      0xFF

// Bit 6 of MODE_CONFIG is Software Reset (0x40)
#define MODE_CONFIG_RESET_BIT 0x40

bool readRegister(uint8_t reg, uint8_t &val, int &wireErr) {
  Wire.beginTransmission(MAX30100_ADDR);
  Wire.write(reg);
  wireErr = Wire.endTransmission(false);

  if (wireErr != 0) {
    // Retry with repeated start fallback
    Wire.beginTransmission(MAX30100_ADDR);
    Wire.write(reg);
    wireErr = Wire.endTransmission(true);
    if (wireErr != 0) {
      return false;
    }
  }

  uint8_t count = Wire.requestFrom((int)MAX30100_ADDR, 1, (int)true);
  if (count != 1) {
    wireErr = 99; // RX Timeout / 0 bytes received
    return false;
  }

  val = Wire.read();
  return true;
}

bool writeRegister(uint8_t reg, uint8_t val, int &wireErr) {
  Wire.beginTransmission(MAX30100_ADDR);
  Wire.write(reg);
  Wire.write(val);
  wireErr = Wire.endTransmission(true);
  return (wireErr == 0);
}

void printRegisterResult(const char* name, uint8_t regAddr, bool ok, uint8_t val, int err) {
  Serial.printf("%s (0x%02X): ", name, regAddr);
  if (ok) {
    Serial.printf("SUCCESS | Raw Byte = 0x%02X\n", val);
  } else {
    Serial.printf("FAILED  | Wire Error Code = %d ", err);
    if (err == 1) Serial.println("(Data too long to fit in transmit buffer)");
    else if (err == 2) Serial.println("(NACK on transmit of address)");
    else if (err == 3) Serial.println("(NACK on transmit of data)");
    else if (err == 4) Serial.println("(Other I2C bus error)");
    else if (err == 5) Serial.println("(ESP_ERR_TIMEOUT)");
    else if (err == 99) Serial.println("(RX Timeout - 0 bytes received)");
    else Serial.println();
  }
}

void runDiagnosticCycle(int cycleNumber) {
  Serial.println("\n=======================================================");
  Serial.printf("=== MAX30100 SPECIFIC DIAGNOSTIC - CYCLE #%d ===\n", cycleNumber);
  Serial.println("=======================================================");
  Serial.printf("I2C address: 0x%02X\n", MAX30100_ADDR);

  // 1. Probe address 0x57
  Wire.beginTransmission(MAX30100_ADDR);
  byte ackErr = Wire.endTransmission();

  if (ackErr == 0) {
    Serial.println("ACK: YES");
  } else {
    Serial.printf("ACK: NO (Wire Error Code: %d)\n", ackErr);
    Serial.println("PART_ID: -- (Device did not ACK)");
    Serial.println("REV_ID: -- (Device did not ACK)");
    Serial.println("MODE_CONFIG: -- (Device did not ACK)");
    Serial.println("SPO2_CONFIG: -- (Device did not ACK)");
    Serial.println("LED_CONFIG: -- (Device did not ACK)");
    Serial.println("RESET TEST: FAIL (No ACK from 0x57)");
    return;
  }

  // 2. Read individual registers
  uint8_t partId = 0, revId = 0, modeConfig = 0, spo2Config = 0, ledConfig = 0;
  int errPart = 0, errRev = 0, errMode = 0, errSpo2 = 0, errLed = 0;

  bool okPart = readRegister(REG_PART_ID, partId, errPart);
  printRegisterResult("PART_ID", REG_PART_ID, okPart, partId, errPart);

  bool okRev = readRegister(REG_REVISION_ID, revId, errRev);
  printRegisterResult("REV_ID", REG_REVISION_ID, okRev, revId, errRev);

  bool okMode = readRegister(REG_MODE_CONFIG, modeConfig, errMode);
  printRegisterResult("MODE_CONFIG", REG_MODE_CONFIG, okMode, modeConfig, errMode);

  bool okSpo2 = readRegister(REG_SPO2_CONFIG, spo2Config, errSpo2);
  printRegisterResult("SPO2_CONFIG", REG_SPO2_CONFIG, okSpo2, spo2Config, errSpo2);

  bool okLed = readRegister(REG_LED_CONFIG, ledConfig, errLed);
  printRegisterResult("LED_CONFIG", REG_LED_CONFIG, okLed, ledConfig, errLed);

  // 3. Software Reset Test
  Serial.print("Executing Software Reset (Write 0x40 to MODE_CONFIG)... ");
  int resetWriteErr = 0;
  bool resetWriteOk = writeRegister(REG_MODE_CONFIG, MODE_CONFIG_RESET_BIT, resetWriteErr);

  if (!resetWriteOk) {
    Serial.printf("FAIL (Write Error Code: %d)\n", resetWriteErr);
    Serial.println("RESET TEST: FAIL");
  } else {
    Serial.println("OK");
    delay(100); // Wait 100 ms as required

    uint8_t modeAfterReset = 0;
    int resetReadErr = 0;
    bool resetReadOk = readRegister(REG_MODE_CONFIG, modeAfterReset, resetReadErr);

    if (resetReadOk) {
      Serial.printf("MODE_CONFIG after 100ms: Raw Byte = 0x%02X\n", modeAfterReset);
      // Bit 6 should self-clear to 0 upon completion of reset
      if ((modeAfterReset & MODE_CONFIG_RESET_BIT) == 0) {
        Serial.println("RESET TEST: PASS (Reset bit cleared successfully)");
      } else {
        Serial.println("RESET TEST: FAIL (Reset bit remains set)");
      }
    } else {
      Serial.printf("MODE_CONFIG read after reset FAILED (Error: %d)\n", resetReadErr);
      Serial.println("RESET TEST: FAIL");
    }
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  delay(1000);

  Serial.println("\n*******************************************************");
  Serial.println("  ESP32 MAX30100 SPECIFIC DIAGNOSTIC TEST INITIALIZED");
  Serial.printf("  SDA: GPIO %d | SCL: GPIO %d | Speed: 100000 Hz\n", I2C_SDA, I2C_SCL);
  Serial.println("  Target Address: 0x57");
  Serial.println("*******************************************************");

  // Initialize Wire with timeout
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_CLOCK);
  Wire.setTimeOut(100);

  // Run the diagnostic sequence exactly 3 times
  for (int cycle = 1; cycle <= 3; cycle++) {
    runDiagnosticCycle(cycle);
    if (cycle < 3) {
      Serial.println("\nWaiting 2 seconds before next cycle...");
      delay(2000);
    }
  }

  Serial.println("\n=======================================================");
  Serial.println("  DIAGNOSTIC COMPLETE (All 3 cycles finished)");
  Serial.println("=======================================================");
}

void loop() {
  // Idle after the 3 cycles finish
  delay(1000);
}
