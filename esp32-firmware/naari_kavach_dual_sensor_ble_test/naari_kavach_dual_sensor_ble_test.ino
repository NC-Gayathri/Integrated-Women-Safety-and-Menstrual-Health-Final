/**
 * NAARI KAVACH - DUAL SENSOR BLE INTEGRATION TEST
 *
 * SAFE TEST FIRMWARE ONLY - production firmware is intentionally untouched.
 *
 * Hardware:
 *   ESP32 DOIT ESP32 DEVKIT V1
 *   SOS button: GPIO 4 -> GND, INPUT_PULLUP
 *   Built-in LED: GPIO 2
 *   I2C: SDA GPIO 21, SCL GPIO 22, 100 kHz
 *   GY-521 / MPU6050: normally 0x68 (0x69 if AD0 is HIGH)
 *   MAX3010x optical sensor: 0x57
 *
 * Optical sensor identification:
 *   PART_ID 0x11 -> MAX30100
 *   PART_ID 0x15 -> MAX30102
 *
 * BLE contract (preserved from existing project):
 *   Name: NAARI_KAVACH
 *   Service UUID: 12345678-1234-1234-1234-1234567890ab
 *   Notify UUID:  87654321-4321-4321-4321-ba0987654321
 *
 * No Wi-Fi. No HTTP. No simulated vital values.
 *
 * IMPORTANT:
 * Heart-rate and SpO2 values are derived from real optical samples, but this
 * prototype is not a medical device and the simple ratio-of-ratios SpO2
 * estimate is not clinically calibrated.
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <math.h>

// -----------------------------------------------------------------------------
// BLE
// -----------------------------------------------------------------------------
#define DEVICE_NAME         "NAARI_KAVACH"
#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "87654321-4321-4321-4321-ba0987654321"

BLEServer* pServer = nullptr;
BLECharacteristic* pTxCharacteristic = nullptr;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// -----------------------------------------------------------------------------
// Hardware
// -----------------------------------------------------------------------------
#define PIN_BUTTON 4
#define PIN_LED    2

#define I2C_SDA 21
#define I2C_SCL 22
#define I2C_CLOCK_HZ 100000
#define I2C_TIMEOUT_MS 5

#define MAX3010X_ADDR 0x57
#define MPU6050_ADDR_LOW  0x68
#define MPU6050_ADDR_HIGH 0x69

// -----------------------------------------------------------------------------
// Timing
// -----------------------------------------------------------------------------
#define BUTTON_TRIPLE_CLICK_WINDOW_MS 1800
#define BUTTON_DEBOUNCE_MS 50
#define FALL_COOLDOWN_MS 25000
#define MPU_SAMPLE_INTERVAL_MS 20
#define OPTICAL_RETRY_INTERVAL_MS 2000
#define MPU_RETRY_INTERVAL_MS 2000
#define VITALS_REPORT_INTERVAL_MS 1000
#define SENSOR_STATUS_INTERVAL_MS 5000
#define LED_PULSE_MS 180

// -----------------------------------------------------------------------------
// Button state - intentionally preserves the existing 3-click behavior.
// -----------------------------------------------------------------------------
int buttonClickCount = 0;
unsigned long firstClickTime = 0;
int lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;

// -----------------------------------------------------------------------------
// LED state
// -----------------------------------------------------------------------------
unsigned long ledOffAt = 0;

void pulseLed(unsigned long durationMs = LED_PULSE_MS) {
  digitalWrite(PIN_LED, HIGH);
  ledOffAt = millis() + durationMs;
}

void updateLed() {
  if (ledOffAt != 0 && (long)(millis() - ledOffAt) >= 0) {
    digitalWrite(PIN_LED, LOW);
    ledOffAt = 0;
  }
}

// -----------------------------------------------------------------------------
// BLE helpers
// -----------------------------------------------------------------------------
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    deviceConnected = true;
    Serial.println("[BLE] Client connected.");
  }

  void onDisconnect(BLEServer* server) override {
    deviceConnected = false;
    Serial.println("[BLE] Client disconnected; advertising restarted.");
    server->getAdvertising()->start();
  }
};

void sendBleEvent(const String& payload) {
  if (deviceConnected && pTxCharacteristic != nullptr) {
    pTxCharacteristic->setValue(payload.c_str());
    pTxCharacteristic->notify();
  }
  Serial.printf("[EVENT] %s\n", payload.c_str());
}

// -----------------------------------------------------------------------------
// Bounded I2C helpers.
// -----------------------------------------------------------------------------
bool probeAddress(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission(true) == 0;
}

bool readRegister8(uint8_t addr, uint8_t reg, uint8_t& value) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;

  int received = Wire.requestFrom((int)addr, 1, (int)true);
  if (received != 1) return false;

  value = Wire.read();
  return true;
}

bool writeRegister8(uint8_t addr, uint8_t reg, uint8_t value) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission(true) == 0;
}

bool readBytes(uint8_t addr, uint8_t reg, uint8_t* buffer, uint8_t length) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;

  int received = Wire.requestFrom((int)addr, (int)length, (int)true);
  if (received != length) {
    while (Wire.available()) (void)Wire.read();
    return false;
  }

  for (uint8_t i = 0; i < length; ++i) {
    buffer[i] = Wire.read();
  }
  return true;
}

// -----------------------------------------------------------------------------
// SOS button
// -----------------------------------------------------------------------------
void updateButtonState() {
  int reading = digitalRead(PIN_BUTTON);

  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > BUTTON_DEBOUNCE_MS) {
    static int currentStableState = HIGH;

    if (reading != currentStableState) {
      currentStableState = reading;

      if (currentStableState == LOW) {
        unsigned long now = millis();

        if (buttonClickCount == 0 ||
            (now - firstClickTime) > BUTTON_TRIPLE_CLICK_WINDOW_MS) {
          buttonClickCount = 1;
          firstClickTime = now;
          Serial.println("[SOS] Button 1/3");
        } else {
          buttonClickCount++;
          Serial.printf("[SOS] Button %d/3\n", buttonClickCount);

          if (buttonClickCount >= 3) {
            Serial.println("[SOS] TRIGGERED");
            sendBleEvent("SOS");
            pulseLed(500);
            buttonClickCount = 0;
          }
        }
      }
    }
  }

  if (buttonClickCount > 0 &&
      (millis() - firstClickTime) > BUTTON_TRIPLE_CLICK_WINDOW_MS) {
    buttonClickCount = 0;
  }

  lastButtonState = reading;
}

// -----------------------------------------------------------------------------
// MPU6050 / GY-521
// -----------------------------------------------------------------------------
uint8_t mpuAddr = 0;
bool mpuReady = false;
unsigned long lastMpuSample = 0;
unsigned long lastMpuRetry = 0;
uint8_t mpuConsecutiveErrors = 0;

enum FallState {
  FALL_IDLE,
  FALL_FREE_FALL,
  FALL_IMPACT
};

FallState fallState = FALL_IDLE;
unsigned long freeFallStartedAt = 0;
unsigned long impactStartedAt = 0;
unsigned long lastFallTriggeredAt = 0;

bool initializeMpuAt(uint8_t addr) {
  if (!probeAddress(addr)) return false;

  uint8_t whoAmI = 0;
  if (!readRegister8(addr, 0x75, whoAmI)) return false;

  // MPU6050 normally returns 0x68.
  if (whoAmI != 0x68) {
    Serial.printf("[MPU] Address 0x%02X responded but WHO_AM_I=0x%02X.\n", addr, whoAmI);
    return false;
  }

  if (!writeRegister8(addr, 0x6B, 0x00)) return false; // Wake up.

  mpuAddr = addr;
  mpuReady = true;
  mpuConsecutiveErrors = 0;

  Serial.printf("[MPU] GY-521/MPU6050 ready at 0x%02X.\n", addr);
  sendBleEvent("SENSOR:MPU6050:READY");
  return true;
}

void tryInitializeMpu() {
  if (initializeMpuAt(MPU6050_ADDR_LOW)) return;
  if (initializeMpuAt(MPU6050_ADDR_HIGH)) return;

  mpuReady = false;
  mpuAddr = 0;
  Serial.println("[MPU] Not detected at 0x68 or 0x69.");
}

void updateMpuFallDetection() {
  unsigned long now = millis();

  if (!mpuReady) {
    if (now - lastMpuRetry >= MPU_RETRY_INTERVAL_MS) {
      lastMpuRetry = now;
      tryInitializeMpu();
    }
    return;
  }

  if (now - lastMpuSample < MPU_SAMPLE_INTERVAL_MS) return;
  lastMpuSample = now;

  uint8_t raw[6];
  if (!readBytes(mpuAddr, 0x3B, raw, sizeof(raw))) {
    if (++mpuConsecutiveErrors >= 3) {
      mpuReady = false;
      mpuConsecutiveErrors = 0;
      Serial.println("[MPU] I2C failures; sensor marked unavailable.");
      sendBleEvent("SENSOR:MPU6050:I2C_ERROR");
    }
    return;
  }

  mpuConsecutiveErrors = 0;

  int16_t axRaw = (int16_t)((raw[0] << 8) | raw[1]);
  int16_t ayRaw = (int16_t)((raw[2] << 8) | raw[3]);
  int16_t azRaw = (int16_t)((raw[4] << 8) | raw[5]);

  const float ax = axRaw / 16384.0f;
  const float ay = ayRaw / 16384.0f;
  const float az = azRaw / 16384.0f;
  const float magnitude = sqrtf(ax * ax + ay * ay + az * az);

  if (now - lastFallTriggeredAt < FALL_COOLDOWN_MS) {
    fallState = FALL_IDLE;
    return;
  }

  switch (fallState) {
    case FALL_IDLE:
      if (magnitude < 0.50f) {
        fallState = FALL_FREE_FALL;
        freeFallStartedAt = now;
      }
      break;

    case FALL_FREE_FALL:
      if (magnitude > 2.50f) {
        fallState = FALL_IMPACT;
        impactStartedAt = now;
      } else if (now - freeFallStartedAt > 600) {
        fallState = FALL_IDLE;
      }
      break;

    case FALL_IMPACT:
      if (now - impactStartedAt > 1000) {
        if (magnitude > 0.80f && magnitude < 1.30f) {
          lastFallTriggeredAt = now;
          sendBleEvent("FALL_DETECTED");
          pulseLed(500);
        }
        fallState = FALL_IDLE;
      }
      break;
  }
}

// -----------------------------------------------------------------------------
// MAX30100 / MAX30102
// -----------------------------------------------------------------------------
enum OpticalChip {
  OPTICAL_NONE,
  OPTICAL_MAX30100,
  OPTICAL_MAX30102,
  OPTICAL_UNKNOWN
};

OpticalChip opticalChip = OPTICAL_NONE;
bool opticalReady = false;
uint8_t opticalPartId = 0;
uint8_t opticalRevisionId = 0;
uint8_t opticalConsecutiveErrors = 0;
unsigned long lastOpticalRetry = 0;
unsigned long lastVitalsReport = 0;
unsigned long lastSensorStatusReport = 0;
unsigned long lastOpticalSampleAt = 0;

// Real-signal processing state.
double irDc = 0.0;
double redDc = 0.0;
double irEnvelope = 0.0;
double previousIrAc = 0.0;
bool previousSlopePositive = false;
unsigned long lastPeakAt = 0;
float filteredBpm = 0.0f;
bool heartRateValid = false;

static const int SPO2_WINDOW = 100;
int spo2Samples = 0;
double redSum = 0.0;
double irSum = 0.0;
double redSqSum = 0.0;
double irSqSum = 0.0;
float latestSpo2 = 0.0f;
bool spo2Valid = false;
bool fingerPresent = false;

const char* opticalChipName() {
  switch (opticalChip) {
    case OPTICAL_MAX30100: return "MAX30100";
    case OPTICAL_MAX30102: return "MAX30102";
    case OPTICAL_UNKNOWN:  return "MAX3010X_UNKNOWN";
    default:               return "NONE";
  }
}

void resetVitalsState() {
  irDc = 0.0;
  redDc = 0.0;
  irEnvelope = 0.0;
  previousIrAc = 0.0;
  previousSlopePositive = false;
  lastPeakAt = 0;
  filteredBpm = 0.0f;
  heartRateValid = false;

  spo2Samples = 0;
  redSum = 0.0;
  irSum = 0.0;
  redSqSum = 0.0;
  irSqSum = 0.0;
  latestSpo2 = 0.0f;
  spo2Valid = false;
  fingerPresent = false;
}

bool configureMax30100() {
  // Clear 16-sample FIFO.
  if (!writeRegister8(MAX3010X_ADDR, 0x02, 0x00)) return false;
  if (!writeRegister8(MAX3010X_ADDR, 0x03, 0x00)) return false;
  if (!writeRegister8(MAX3010X_ADDR, 0x04, 0x00)) return false;

  // 100 sps, high-resolution, 1600 us pulse width.
  if (!writeRegister8(MAX3010X_ADDR, 0x07, 0x47)) return false;

  // Red 17.4 mA, IR 17.4 mA.
  if (!writeRegister8(MAX3010X_ADDR, 0x09, 0x55)) return false;

  // SpO2 mode: red + IR.
  if (!writeRegister8(MAX3010X_ADDR, 0x06, 0x03)) return false;
  return true;
}

bool configureMax30102() {
  // Clear 32-word FIFO.
  if (!writeRegister8(MAX3010X_ADDR, 0x04, 0x00)) return false;
  if (!writeRegister8(MAX3010X_ADDR, 0x05, 0x00)) return false;
  if (!writeRegister8(MAX3010X_ADDR, 0x06, 0x00)) return false;

  // No sample averaging; no rollover. We poll frequently and keep latency bounded.
  if (!writeRegister8(MAX3010X_ADDR, 0x08, 0x00)) return false;

  // ADC range 4096 nA, 100 sps, 411 us pulse width, 18-bit.
  if (!writeRegister8(MAX3010X_ADDR, 0x0A, 0x27)) return false;

  // Moderate LED current (~12.6 mA each).
  if (!writeRegister8(MAX3010X_ADDR, 0x0C, 0x3F)) return false; // Red.
  if (!writeRegister8(MAX3010X_ADDR, 0x0D, 0x3F)) return false; // IR.

  // SpO2 mode: Red + IR.
  if (!writeRegister8(MAX3010X_ADDR, 0x09, 0x03)) return false;
  return true;
}

bool identifyAndConfigureOptical() {
  if (!probeAddress(MAX3010X_ADDR)) {
    opticalChip = OPTICAL_NONE;
    opticalReady = false;
    return false;
  }

  uint8_t part = 0;
  uint8_t rev = 0;

  if (!readRegister8(MAX3010X_ADDR, 0xFF, part) ||
      !readRegister8(MAX3010X_ADDR, 0xFE, rev)) {
    opticalChip = OPTICAL_UNKNOWN;
    opticalReady = false;
    return false;
  }

  opticalPartId = part;
  opticalRevisionId = rev;

  if (part == 0x11) {
    opticalChip = OPTICAL_MAX30100;
  } else if (part == 0x15) {
    opticalChip = OPTICAL_MAX30102;
  } else {
    opticalChip = OPTICAL_UNKNOWN;
    opticalReady = false;

    Serial.printf("[OPTICAL] 0x57 responded, unknown PART_ID=0x%02X REV=0x%02X.\n", part, rev);
    sendBleEvent("SENSOR:MAX3010X:UNKNOWN_PART");
    return false;
  }

  bool configured =
      opticalChip == OPTICAL_MAX30100 ? configureMax30100() :
      opticalChip == OPTICAL_MAX30102 ? configureMax30102() :
      false;

  if (!configured) {
    opticalReady = false;
    Serial.printf("[OPTICAL] %s detected but configuration failed.\n", opticalChipName());
    sendBleEvent(String("SENSOR:") + opticalChipName() + ":CONFIG_ERROR");
    return false;
  }

  opticalReady = true;
  opticalConsecutiveErrors = 0;
  lastOpticalSampleAt = millis();
  resetVitalsState();

  Serial.printf("[OPTICAL] %s ready. PART_ID=0x%02X REV=0x%02X.\n",
                opticalChipName(), opticalPartId, opticalRevisionId);

  sendBleEvent(String("SENSOR:") + opticalChipName() + ":READY");
  return true;
}

bool readMax30100Sample(uint32_t& red, uint32_t& ir) {
  uint8_t wr = 0;
  uint8_t rd = 0;
  if (!readRegister8(MAX3010X_ADDR, 0x02, wr)) return false;
  if (!readRegister8(MAX3010X_ADDR, 0x04, rd)) return false;

  wr &= 0x0F;
  rd &= 0x0F;
  if (wr == rd) return false; // No unread sample.

  uint8_t raw[4];
  if (!readBytes(MAX3010X_ADDR, 0x05, raw, sizeof(raw))) return false;

  // MAX30100 FIFO order in SpO2 mode is IR then RED.
  ir  = ((uint32_t)raw[0] << 8) | raw[1];
  red = ((uint32_t)raw[2] << 8) | raw[3];
  return true;
}

bool readMax30102Sample(uint32_t& red, uint32_t& ir) {
  uint8_t wr = 0;
  uint8_t rd = 0;
  if (!readRegister8(MAX3010X_ADDR, 0x04, wr)) return false;
  if (!readRegister8(MAX3010X_ADDR, 0x06, rd)) return false;

  wr &= 0x1F;
  rd &= 0x1F;
  if (wr == rd) return false; // No unread sample.

  uint8_t raw[6];
  if (!readBytes(MAX3010X_ADDR, 0x07, raw, sizeof(raw))) return false;

  // MAX30102 SpO2 mode FIFO order is Red then IR; each sample is 18-bit.
  red = ((((uint32_t)raw[0] << 16) |
          ((uint32_t)raw[1] << 8) |
          raw[2]) & 0x03FFFF);

  ir = ((((uint32_t)raw[3] << 16) |
         ((uint32_t)raw[4] << 8) |
         raw[5]) & 0x03FFFF);

  return true;
}

void processOpticalSample(uint32_t redRaw, uint32_t irRaw) {
  // Initialize DC baselines from the first real sample.
  if (irDc == 0.0 || redDc == 0.0) {
    irDc = irRaw;
    redDc = redRaw;
  }

  // Slow DC tracking; AC carries the pulsatile component.
  const double alpha = 0.99;
  irDc = alpha * irDc + (1.0 - alpha) * (double)irRaw;
  redDc = alpha * redDc + (1.0 - alpha) * (double)redRaw;

  const double irAc = (double)irRaw - irDc;
  const double redAc = (double)redRaw - redDc;

  irEnvelope = 0.95 * irEnvelope + 0.05 * fabs(irAc);

  // Scale-independent finger check: meaningful DC light plus pulsatile energy.
  fingerPresent = (irDc > 3000.0 && redDc > 1000.0 && irEnvelope > 10.0);

  // Heart-rate peak detection from the real IR AC waveform.
  bool slopePositive = irAc > previousIrAc;
  double peakThreshold = fmax(15.0, irEnvelope * 0.55);

  if (fingerPresent &&
      previousSlopePositive &&
      !slopePositive &&
      previousIrAc > peakThreshold) {

    unsigned long now = millis();

    if (lastPeakAt != 0) {
      unsigned long interval = now - lastPeakAt;

      // 30-200 BPM physiological sanity range for prototype filtering.
      if (interval >= 300 && interval <= 2000) {
        float bpm = 60000.0f / (float)interval;

        if (filteredBpm <= 0.0f) {
          filteredBpm = bpm;
        } else {
          filteredBpm = 0.75f * filteredBpm + 0.25f * bpm;
        }

        heartRateValid = filteredBpm >= 30.0f && filteredBpm <= 200.0f;
      }
    }

    lastPeakAt = now;
  }

  previousSlopePositive = slopePositive;
  previousIrAc = irAc;

  // Ratio-of-ratios window for real-signal SpO2 estimate.
  if (fingerPresent) {
    redSum += redRaw;
    irSum += irRaw;
    redSqSum += (double)redRaw * (double)redRaw;
    irSqSum += (double)irRaw * (double)irRaw;
    spo2Samples++;

    if (spo2Samples >= SPO2_WINDOW) {
      const double n = (double)spo2Samples;
      const double redMean = redSum / n;
      const double irMean = irSum / n;

      double redVariance = (redSqSum / n) - (redMean * redMean);
      double irVariance = (irSqSum / n) - (irMean * irMean);

      if (redVariance < 0.0) redVariance = 0.0;
      if (irVariance < 0.0) irVariance = 0.0;

      const double redRms = sqrt(redVariance);
      const double irRms = sqrt(irVariance);

      if (redMean > 0.0 && irMean > 0.0 && redRms > 0.0 && irRms > 0.0) {
        const double ratio = (redRms / redMean) / (irRms / irMean);

        // Common prototype approximation. It is derived from real samples,
        // but it is NOT a medical calibration curve.
        double estimate = 110.0 - 25.0 * ratio;

        if (estimate >= 70.0 && estimate <= 100.0 && ratio > 0.1 && ratio < 2.0) {
          latestSpo2 = (float)estimate;
          spo2Valid = true;
        } else {
          spo2Valid = false;
        }
      } else {
        spo2Valid = false;
      }

      spo2Samples = 0;
      redSum = 0.0;
      irSum = 0.0;
      redSqSum = 0.0;
      irSqSum = 0.0;
    }
  } else {
    // Never carry stale "good" values across a missing-finger condition.
    heartRateValid = false;
    spo2Valid = false;
    filteredBpm = 0.0f;
    lastPeakAt = 0;

    spo2Samples = 0;
    redSum = 0.0;
    irSum = 0.0;
    redSqSum = 0.0;
    irSqSum = 0.0;
  }
}

void updateOpticalSensor() {
  unsigned long now = millis();

  if (!opticalReady) {
    if (now - lastOpticalRetry >= OPTICAL_RETRY_INTERVAL_MS) {
      lastOpticalRetry = now;

      if (!identifyAndConfigureOptical()) {
        if (now - lastSensorStatusReport >= SENSOR_STATUS_INTERVAL_MS) {
          lastSensorStatusReport = now;
          sendBleEvent("SENSOR:MAX3010X:NOT_READY");
        }
      }
    }
    return;
  }

  // Bound the amount of sensor work performed per loop so SOS remains responsive.
  int samplesReadThisLoop = 0;

  for (int attempt = 0; attempt < 2; ++attempt) {
    updateButtonState();

    uint32_t red = 0;
    uint32_t ir = 0;
    bool gotSample = false;

    if (opticalChip == OPTICAL_MAX30100) {
      gotSample = readMax30100Sample(red, ir);
    } else if (opticalChip == OPTICAL_MAX30102) {
      gotSample = readMax30102Sample(red, ir);
    }

    if (!gotSample) break;

    samplesReadThisLoop++;
    lastOpticalSampleAt = now;
    opticalConsecutiveErrors = 0;
    processOpticalSample(red, ir);
  }

  // A configured optical sensor should keep producing FIFO samples even with
  // no finger present. If samples stop, distinguish an unplugged bus from a
  // sensor that still ACKs but needs reconfiguration. This check is infrequent
  // and each I2C operation is bounded by I2C_TIMEOUT_MS.
  if (samplesReadThisLoop == 0 && now - lastOpticalSampleAt > 1500) {
    uint8_t livePartId = 0;
    bool busAlive = probeAddress(MAX3010X_ADDR) &&
                    readRegister8(MAX3010X_ADDR, 0xFF, livePartId);

    if (!busAlive || livePartId != opticalPartId) {
      opticalReady = false;
      heartRateValid = false;
      spo2Valid = false;
      fingerPresent = false;
      lastOpticalRetry = now;
      Serial.println("[OPTICAL] Sensor disconnected or I2C read failed.");
      sendBleEvent(String("SENSOR:") + opticalChipName() + ":I2C_ERROR");
      return;
    }

    Serial.println("[OPTICAL] Device responds but FIFO stalled; reconfiguring.");
    if (!identifyAndConfigureOptical()) {
      opticalReady = false;
      lastOpticalRetry = now;
      return;
    }
  }

  if (now - lastVitalsReport >= VITALS_REPORT_INTERVAL_MS) {
    lastVitalsReport = now;

    if (!fingerPresent) {
      sendBleEvent("VITALS:NO_VALID_READING");
      return;
    }

    if (heartRateValid) {
      sendBleEvent(String("HEART_RATE:") + String((int)lroundf(filteredBpm)));
    }

    if (spo2Valid) {
      sendBleEvent(String("SPO2:") + String((int)lroundf(latestSpo2)));
    }

    if (!heartRateValid && !spo2Valid) {
      sendBleEvent("VITALS:ACQUIRING");
    }
  }
}

// -----------------------------------------------------------------------------
// Setup / loop
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_CLOCK_HZ);
  Wire.setTimeOut(I2C_TIMEOUT_MS);

  Serial.println();
  Serial.println("=======================================================");
  Serial.println(" NAARI KAVACH - DUAL SENSOR BLE TEST");
  Serial.println("=======================================================");
  Serial.printf("BLE Name: %s\n", DEVICE_NAME);
  Serial.printf("I2C: SDA=%d SCL=%d @ %d Hz, timeout=%d ms\n",
                I2C_SDA, I2C_SCL, I2C_CLOCK_HZ, I2C_TIMEOUT_MS);
  Serial.println("Wi-Fi: DISABLED");
  Serial.println("HTTP: DISABLED");

  // BLE starts regardless of sensor health.
  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_READ |
      BLECharacteristic::PROPERTY_NOTIFY |
      BLECharacteristic::PROPERTY_INDICATE);
  pTxCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  // Probe both sensors once; failure never prevents SOS/BLE startup.
  tryInitializeMpu();
  identifyAndConfigureOptical();

  Serial.println("[READY] BLE + SOS active. Sensor failures are non-fatal.");
  Serial.println("[READY] Press GPIO4 button three times within 1.8s for SOS.");
}

void loop() {
  // SOS is intentionally first.
  updateButtonState();
  updateLed();

  // Connection transition notification; no blocking delays.
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = true;
    sendBleEvent("STATUS:ONLINE");
  } else if (!deviceConnected && oldDeviceConnected) {
    oldDeviceConnected = false;
    pServer->startAdvertising();
  }

  // Sensor work is bounded and each path has a short I2C timeout.
  updateMpuFallDetection();
  updateButtonState();

  updateOpticalSensor();
  updateButtonState();

  updateLed();

  // Yield to the ESP32 RTOS without a long blocking delay.
  delay(1);
}
