/*
 * NAARI KAVACH MAX30102 emitter / I2C isolation sketch.
 * This is NOT the BLE + SOS application. Flash the production sketch again
 * after diagnosis. Power OFF before disconnecting the MPU or optical board.
 * Only use 3.3-V-compatible breakouts and common ground.
 * SDA=21, SCL=22. No fictitious vitals, and no GPIO used to drive the optical LEDs.
 */
#include <Arduino.h>
#include <Wire.h>

constexpr uint8_t SDA_PIN = 21;
constexpr uint8_t SCL_PIN = 22;
constexpr uint8_t MAX_ADDR = 0x57;
constexpr uint8_t MPU_ADDR_LOW = 0x68;
constexpr uint8_t MPU_ADDR_HIGH = 0x69;
constexpr uint8_t PART_ID = 0xFF;
constexpr uint8_t MODE_CONFIG = 0x09;
constexpr uint8_t RED_PA = 0x0C;
constexpr uint8_t IR_PA = 0x0D;
constexpr unsigned int BUS_HZ = 10000;  // Diagnostic only, not production data rate.
constexpr unsigned long LIGHT_TEST_MS = 10000;

bool probe(uint8_t addr) {
  Wire.beginTransmission(addr);
  const uint8_t error = Wire.endTransmission(true);
  Serial.printf("[PROBE] addr=0x%02X result=%u (0=ACK, 2=NACK, 4=other, 5=timeout)\n",
                addr, (unsigned int)error);
  return error == 0;
}

bool read8(uint8_t reg, uint8_t& out) {
  Wire.beginTransmission(MAX_ADDR);
  Wire.write(reg);
  const uint8_t err = Wire.endTransmission(true);  // STOP-based register pointer.
  if (err != 0) {
    Serial.printf("[LIGHT_TEST] read pointer reg=0x%02X tx=%u\n", reg, (unsigned int)err);
    return false;
  }
  const int received = Wire.requestFrom((int)MAX_ADDR, 1, (int)true);
  if (received != 1) {
    Serial.printf("[LIGHT_TEST] short read reg=0x%02X rx=%d\n", reg, received);
    while (Wire.available()) (void)Wire.read();
    return false;
  }
  out = Wire.read();
  return true;
}

bool write8(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MAX_ADDR);
  Wire.write(reg);
  Wire.write(value);
  const uint8_t err = Wire.endTransmission(true);
  if (err != 0) {
    Serial.printf("[LIGHT_TEST] write reg=0x%02X tx=%u\n", reg, (unsigned int)err);
    return false;
  }
  return true;
}

bool equals(uint8_t reg, uint8_t expected, uint8_t mask = 0xFF) {
  uint8_t actual = 0;
  if (!read8(reg, actual)) return false;
  if ((actual & mask) == expected) return true;
  Serial.printf("[LIGHT_TEST] mismatch reg=0x%02X got=0x%02X expected=0x%02X mask=0x%02X\n",
                reg, actual, expected, mask);
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[LIGHT_TEST] isolated-max30102-emitter-v24-20261017");
  Serial.println("[LIGHT_TEST] NOT the BLE/SOS sketch. Reflash production after diagnosis.");

  pinMode(SDA_PIN, INPUT_PULLUP);
  pinMode(SCL_PIN, INPUT_PULLUP);
  const bool began = Wire.begin(SDA_PIN, SCL_PIN);
  const bool clockOk = began && Wire.setClock(BUS_HZ);
  if (clockOk) Wire.setTimeOut(100);
  if (!clockOk) {
    Serial.println("[LIGHT_TEST] BUS_INIT_FAILED. No sensor I2C operations permitted.");
    return;
  }
  Serial.printf("[LIGHT_TEST] SDA=%d SCL=%d bus=%uHz idle_sda=%d idle_scl=%d\n",
                SDA_PIN, SCL_PIN, BUS_HZ, digitalRead(SDA_PIN), digitalRead(SCL_PIN));

  (void)probe(MPU_ADDR_LOW);   // A NACK is expected if the MPU was isolated.
  (void)probe(MPU_ADDR_HIGH);
  if (!probe(MAX_ADDR)) {
    Serial.println("[LIGHT_TEST] NO_OPTICAL_ACK. Cannot activate any emitter by software.");
    return;
  }

  uint8_t part = 0;
  if (!read8(PART_ID, part)) {
    Serial.println("[LIGHT_TEST] PART_ID_READ_FAILED. No LED configuration attempted.");
    return;
  }
  Serial.printf("[LIGHT_TEST] PART_ID=0x%02X\n", part);
  if (part != 0x15) {
    Serial.println("[LIGHT_TEST] NOT_MAX30102. No configuration of an unknown device.");
    return;
  }
  if (!write8(MODE_CONFIG, 0x40)) {
    Serial.println("[LIGHT_TEST] RESET_WRITE_FAILED.");
    return;
  }

  bool resetComplete = false;
  const unsigned long beganReset = millis();
  while (millis() - beganReset < 150) {
    uint8_t mode = 0x40;
    if (read8(MODE_CONFIG, mode) && (mode & 0x40) == 0) {
      resetComplete = true;
      break;
    }
    delay(5);
  }
  if (!resetComplete) {
    Serial.println("[LIGHT_TEST] RESET_UNVERIFIED. No LED drive attempted.");
    return;
  }

  // Start with the same measured-register configuration as the BLE sketch.
  // 100 sps / 411 us pulse / 4096 nA; red and IR programmed to 0x3F.
  const bool wrote =
      write8(0x04, 0x00) && write8(0x05, 0x00) &&
      write8(0x06, 0x00) && write8(0x08, 0x00) &&
      write8(0x0A, 0x27) && write8(RED_PA, 0x3F) &&
      write8(IR_PA, 0x3F) && write8(MODE_CONFIG, 0x03);
  const bool verified = wrote && equals(MODE_CONFIG, 0x03, 0xC7) &&
      equals(0x08, 0x00) && equals(0x0A, 0x27) &&
      equals(RED_PA, 0x3F) && equals(IR_PA, 0x3F);
  if (!verified) {
    Serial.println("[LIGHT_TEST] CONFIG_NOT_VERIFIED. Do not infer LED operation.");
    // Best effort: place the chip in shutdown even after a partial failure.
    (void)write8(MODE_CONFIG, 0x80);
    return;
  }

  Serial.println("[LIGHT_TEST] DRIVE_REGISTERS_VERIFIED. Check RED light visually.");
  Serial.println("[LIGHT_TEST] IR is invisible to the naked eye; inspect the breakout supply.");
  const unsigned long start = millis();
  while (millis() - start < LIGHT_TEST_MS) delay(10);
  // The diagnostic stops emitter drive after 10 s; it never stays lit forever.
  const bool stopped = write8(MODE_CONFIG, 0x80) &&
                       equals(MODE_CONFIG, 0x80, 0xC7);
  Serial.println(stopped ? "[LIGHT_TEST] EMITTER_SHUTDOWN_VERIFIED" :
                           "[LIGHT_TEST] SHUTDOWN_UNVERIFIED. Disconnect power safely.");
}

void loop() {
  delay(100);
}
