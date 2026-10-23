/*
 * NAARI KAVACH V25 - READ-ONLY EVIDENCE TRIAGE (apart from sensor configuration).
 *
 * STANDALONE DIAGNOSTIC, NOT THE SAFETY APPLICATION:
 * Flashing this temporarily replaces BLE, SOS notifications and fall detection.
 * Do not wear or rely on the device for emergency assistance during this test.
 * Reflash naari_kavach_dual_sensor_ble_test.ino afterwards.
 *
 * Board: DOIT ESP32 DEVKIT V1. Shared I2C SDA21, SCL22.
 * Clock: 10 kHz to reduce bus timing demands while identifying electrical faults.
 * MAX30102 configured at 50 samples/s, with bounded LED current settings.
 * Never power or rewire modules while USB/sensor power is on.
 */
#include <Arduino.h>
#include <Wire.h>

constexpr uint8_t SDA_PIN = 21;
constexpr uint8_t SCL_PIN = 22;
constexpr uint8_t OPT_ADDR = 0x57;
constexpr uint8_t MPU_A = 0x68;
constexpr uint8_t MPU_B = 0x69;
constexpr unsigned long TEST_DURATION_MS = 30000;
constexpr unsigned long SENSOR_POLL_MS = 20;
constexpr unsigned long MPU_POLL_MS = 1000;
constexpr unsigned long BUS_SCAN_MS = 2000;
constexpr uint16_t I2C_TIMEOUT_MS = 80;

bool busReady = false;
bool opticalReady = false;
bool mpuReady = false;
bool testFinished = false;
uint8_t mpuAddr = 0;
unsigned long startedAt = 0, lastOptPoll = 0, lastMpuPoll = 0, lastBusScan = 0;
uint32_t opticalSamples = 0, opticalNonzero = 0, mpuSamples = 0;
uint32_t opticalErrors = 0, mpuErrors = 0;
uint32_t optAcks = 0, mpuAcks = 0;
uint32_t minRed = 0xFFFFFFFF, minIr = 0xFFFFFFFF, maxRed = 0, maxIr = 0;

// Hardware result codes are printed exactly as observed: 0 ACK, 2/3 NACK,
// 4 unspecified controller error, 5 timeout. HIGH is only a pin snapshot.
bool probe(uint8_t addr, bool verbose = true) {
  Wire.beginTransmission(addr);
  const uint8_t status = Wire.endTransmission(true);
  if (verbose || status != 0) {
    Serial.printf("[TRIAGE_PROBE] addr=0x%02X error=%u SDA=%d SCL=%d\n",
      addr, (unsigned int)status, digitalRead(SDA_PIN), digitalRead(SCL_PIN));
  }
  if (status == 0) {
    if (addr == OPT_ADDR) ++optAcks; else ++mpuAcks;
  }
  return status == 0;
}

// STOP-based, one-shot transfer. On a short read, discard all bytes and fail.
// No empty, partial or stale buffer is accepted as evidence of a good sample.
bool readBytes(uint8_t addr, uint8_t reg, uint8_t* dest, uint8_t length) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  const uint8_t tx = Wire.endTransmission(true);
  if (tx != 0) {
    Serial.printf("[TRIAGE_I2C] addr=0x%02X reg=0x%02X tx=%u rx=-1\n",
      addr, reg, (unsigned int)tx);
    return false;
  }
  const int rx = Wire.requestFrom((int)addr, (int)length, (int)true);
  if (rx != length) {
    Serial.printf("[TRIAGE_I2C] addr=0x%02X reg=0x%02X tx=0 rx=%d expected=%u\n",
      addr, reg, rx, (unsigned int)length);
    while (Wire.available()) (void)Wire.read();
    return false;
  }
  for (uint8_t i = 0; i < length; ++i) dest[i] = Wire.read();
  return true;
}
bool read8(uint8_t addr, uint8_t reg, uint8_t& out) {
  return readBytes(addr, reg, &out, 1);
}
bool write8(uint8_t addr, uint8_t reg, uint8_t value) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(value);
  const uint8_t tx = Wire.endTransmission(true);
  if (tx != 0) {
    Serial.printf("[TRIAGE_I2C] write addr=0x%02X reg=0x%02X tx=%u\n",
      addr, reg, (unsigned int)tx);
    return false;
  }
  return true;
}
bool matches(uint8_t addr, uint8_t reg, uint8_t expected, uint8_t mask = 0xFF) {
  uint8_t actual = 0;
  if (!read8(addr, reg, actual)) return false;
  if ((actual & mask) == expected) return true;
  Serial.printf("[TRIAGE_READBACK] addr=0x%02X reg=0x%02X expected=0x%02X actual=0x%02X\n",
    addr, reg, expected, actual);
  return false;
}

bool initMpu() {
  const uint8_t addresses[] = {MPU_A, MPU_B};
  for (uint8_t addr : addresses) {
    if (!probe(addr)) continue;
    uint8_t who = 0;
    if (!read8(addr, 0x75, who)) { ++mpuErrors; continue; }
    Serial.printf("[TRIAGE_MPU] addr=0x%02X WHO_AM_I=0x%02X\n", addr, who);
    if (who != 0x68 && who != 0x70) continue;
    if (!write8(addr, 0x6B, 0x00) || !matches(addr, 0x6B, 0x00, 0x40) ||
        !write8(addr, 0x1C, 0x10) || !matches(addr, 0x1C, 0x10, 0x18)) {
      ++mpuErrors;
      Serial.println("[TRIAGE_MPU] CONFIG_FAIL; acceleration cannot be trusted.");
      continue;
    }
    mpuAddr = addr;
    Serial.println("[TRIAGE_MPU] CONFIG_VERIFIED; waiting for actual acceleration samples.");
    return true;
  }
  Serial.println("[TRIAGE_MPU] NOT_READY; absent, unsupported or unstable.");
  return false;
}

bool initOptical() {
  if (!probe(OPT_ADDR)) {
    Serial.println("[TRIAGE_OPTICAL] NO_ACK; optical LED configuration impossible.");
    return false;
  }
  uint8_t part = 0;
  if (!read8(OPT_ADDR, 0xFF, part)) { ++opticalErrors; return false; }
  Serial.printf("[TRIAGE_OPTICAL] PART_ID=0x%02X\n", part);
  // Reject MAX30100 and unknown chips: this test uses MAX30102 registers only.
  if (part != 0x15) {
    Serial.println("[TRIAGE_OPTICAL] NOT_MAX30102; do not use MAX30102 register map.");
    return false;
  }
  if (!write8(OPT_ADDR, 0x09, 0x40)) { ++opticalErrors; return false; }
  bool resetDone = false;
  const unsigned long resetStart = millis();
  while (millis() - resetStart < 150) {
    uint8_t mode = 0x40;
    if (read8(OPT_ADDR, 0x09, mode) && (mode & 0x40) == 0) {
      resetDone = true; break;
    }
    delay(5);
  }
  if (!resetDone) {
    ++opticalErrors;
    Serial.println("[TRIAGE_OPTICAL] RESET_FAIL; no LED test.");
    return false;
  }

  // 50 samples/s (0x23), 411us pulses, 4096nA range: fits 10kHz diagnosis.
  // 0x3F RED/IR drive settings copy the verified application settings.
  const bool configured =
    write8(OPT_ADDR, 0x04, 0) && write8(OPT_ADDR, 0x05, 0) &&
    write8(OPT_ADDR, 0x06, 0) && write8(OPT_ADDR, 0x08, 0) &&
    write8(OPT_ADDR, 0x0A, 0x23) &&
    write8(OPT_ADDR, 0x0C, 0x3F) && write8(OPT_ADDR, 0x0D, 0x3F) &&
    write8(OPT_ADDR, 0x09, 0x03);
  const bool verified = configured &&
    matches(OPT_ADDR, 0x09, 0x03, 0xC7) &&
    matches(OPT_ADDR, 0x0A, 0x23) &&
    matches(OPT_ADDR, 0x0C, 0x3F) &&
    matches(OPT_ADDR, 0x0D, 0x3F);
  if (!verified) {
    ++opticalErrors;
    (void)write8(OPT_ADDR, 0x09, 0x80);
    Serial.println("[TRIAGE_OPTICAL] CONFIG_FAIL; LED drive NOT established.");
    return false;
  }
  Serial.println("[TRIAGE_OPTICAL] DRIVE_REGISTERS_VERIFIED; not proof of physical light.");
  return true;
}

void pollOptical() {
  // For each sample, check the FIFO pointers before consuming one FIFO frame.
  // A configured chip with no fresh FIFO data is NOT a passing light test.
  uint8_t meta[3] = {};
  if (!readBytes(OPT_ADDR, 0x04, meta, 3)) {
    ++opticalErrors;
    opticalReady = false;
    Serial.println("[TRIAGE_OPTICAL] METADATA_FAIL; stopping optical sampling.");
    return;
  }
  if ((meta[1] & 0x1F) != 0) {
    ++opticalErrors;
    opticalReady = false;
    Serial.println("[TRIAGE_OPTICAL] FIFO_OVERFLOW; missing samples.");
    return;
  }
  if ((meta[0] & 0x1F) == (meta[2] & 0x1F)) return;
  uint8_t raw[6] = {};
  if (!readBytes(OPT_ADDR, 0x07, raw, 6)) {
    ++opticalErrors;
    opticalReady = false;
    Serial.println("[TRIAGE_OPTICAL] FIFO_READ_FAIL; no partial sample accepted.");
    return;
  }
  const uint32_t red = (((uint32_t)raw[0] << 16) | ((uint32_t)raw[1] << 8) | raw[2]) & 0x3FFFF;
  const uint32_t ir  = (((uint32_t)raw[3] << 16) | ((uint32_t)raw[4] << 8) | raw[5]) & 0x3FFFF;
  ++opticalSamples;
  if (red != 0 || ir != 0) ++opticalNonzero;
  if (red < minRed) minRed = red;
  if (ir < minIr) minIr = ir;
  if (red > maxRed) maxRed = red;
  if (ir > maxIr) maxIr = ir;
  if (opticalSamples % 25 == 0) {
    Serial.printf("[TRIAGE_SAMPLE] n=%lu red=%lu ir=%lu\n",
      (unsigned long)opticalSamples, (unsigned long)red, (unsigned long)ir);
  }
}

void pollMpu() {
  uint8_t raw[6] = {};
  if (!readBytes(mpuAddr, 0x3B, raw, 6)) {
    ++mpuErrors;
    mpuReady = false;
    Serial.println("[TRIAGE_MPU] ACCEL_READ_FAIL; no fall evidence.");
    return;
  }
  ++mpuSamples;
  const int16_t x = (int16_t)(((uint16_t)raw[0] << 8) | raw[1]);
  const int16_t y = (int16_t)(((uint16_t)raw[2] << 8) | raw[3]);
  const int16_t z = (int16_t)(((uint16_t)raw[4] << 8) | raw[5]);
  Serial.printf("[TRIAGE_ACCEL] n=%lu x=%d y=%d z=%d (raw, not a fall event)\n",
    (unsigned long)mpuSamples, (int)x, (int)y, (int)z);
}

void finishTest() {
  if (testFinished) return;
  testFinished = true;
  // Fail safe: request optical shutdown whenever an optical device was
  // configured. A failed command is NOT reported as successful shutdown.
  bool stopVerified = false;
  if (opticalSamples > 0 || opticalReady) {
    stopVerified = write8(OPT_ADDR, 0x09, 0x80) &&
                   matches(OPT_ADDR, 0x09, 0x80, 0xC7);
  }
  Serial.printf("[TRIAGE_SUMMARY] optical_samples=%lu nonzero=%lu range_red=%lu..%lu range_ir=%lu..%lu mpu_samples=%lu opt_errors=%lu mpu_errors=%lu opt_acks=%lu mpu_acks=%lu\n",
    (unsigned long)opticalSamples, (unsigned long)opticalNonzero,
    (unsigned long)(opticalSamples ? minRed : 0), (unsigned long)maxRed,
    (unsigned long)(opticalSamples ? minIr : 0), (unsigned long)maxIr,
    (unsigned long)mpuSamples, (unsigned long)opticalErrors,
    (unsigned long)mpuErrors, (unsigned long)optAcks, (unsigned long)mpuAcks);
  Serial.println(stopVerified ? "[TRIAGE_SHUTDOWN] VERIFIED" :
      "[TRIAGE_SHUTDOWN] NOT_VERIFIED_OR_NEVER_CONFIGURED");
  // No complete hardware pass claim: an unmeasured LED supply or silent IR
  // emitter cannot be certified by I2C responses and FIFO statistics alone.
  Serial.println("[TRIAGE_END] Physical LED emission, rail voltages and mobile SOS still need independent validation.");
  Serial.println("[TRIAGE_END] REFLASH THE OFFICIAL BLE+SOS APPLICATION NOW.");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[TRIAGE_VERSION] naari-shared-bus-power-fifo-v25-20261023");
  Serial.println("[TRIAGE_WARNING] Diagnostic temporarily replaces BLE/SOS/fall application.");
  pinMode(SDA_PIN, INPUT_PULLUP);
  pinMode(SCL_PIN, INPUT_PULLUP);
  const bool began = Wire.begin(SDA_PIN, SCL_PIN);
  busReady = began && Wire.setClock(10000);
  if (busReady) Wire.setTimeOut(I2C_TIMEOUT_MS);
  Serial.printf("[TRIAGE_BUS] init=%s SDA=%d SCL=%d freq=10000\n",
    busReady ? "OK" : "FAILED", digitalRead(SDA_PIN), digitalRead(SCL_PIN));
  if (!busReady) {
    Serial.println("[TRIAGE_END] BUS_INIT_FAILED; no sensor I2C transaction attempted.");
    testFinished = true;
    return;
  }
  mpuReady = initMpu();
  opticalReady = initOptical();
  startedAt = millis();
  lastOptPoll = lastMpuPoll = lastBusScan = startedAt;
  Serial.println("[TRIAGE_START] 30 seconds: no finger, then place finger steadily over optical windows.");
}
void loop() {
  if (!busReady || testFinished) { delay(25); return; }
  const unsigned long now = millis();
  if (now - startedAt >= TEST_DURATION_MS) { finishTest(); return; }
  if (now - lastBusScan >= BUS_SCAN_MS) {
    lastBusScan = now;
    (void)probe(OPT_ADDR);
    (void)probe(MPU_A);
    (void)probe(MPU_B);
  }
  if (mpuReady && now - lastMpuPoll >= MPU_POLL_MS) {
    lastMpuPoll = now;
    pollMpu();
  }
  if (opticalReady && now - lastOptPoll >= SENSOR_POLL_MS) {
    lastOptPoll = now;
    pollOptical();
  }
  delay(1);
}
