#include "Arduino.h"
#include <functional>
#include <iostream>
#include <stdexcept>
// Arduino normally supplies these prototypes. Sensor-type declarations must
// remain in the sketch so the real Arduino compile gate checks their ordering.
void updateButtonState();
#include "../../esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino"

void require(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}
void noReady() {
  require(!opticalReady, "failure must leave opticalReady false");
  require(Serial.output.find(":READY") == std::string::npos,
          "failure must not emit an optical READY event");
}
void noMpuReady() {
  require(!mpuReady, "failure must leave mpuReady false");
  require(Serial.output.find("SENSOR:MPU6050:READY") == std::string::npos &&
          Serial.output.find("SENSOR:MPU6500:READY") == std::string::npos,
          "failure must not emit a motion-sensor READY event");
}
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  const std::string name = argv[1];
  const bool max100 = name.find("100") != std::string::npos;
  Wire.reset(max100 ? 0x11 : 0x15);
  try {
    if (name == "ready_100" || name == "ready_102") {
      require(identifyAndConfigureOptical(), "healthy sensor must initialize");
      require(opticalReady, "healthy sensor must be READY");
      require(Serial.output.find(max100 ? "SENSOR:MAX30100:READY" : "SENSOR:MAX30102:READY") != std::string::npos,
              "READY must identify the actual chip");
    } else if (name == "deferred_read_failure") {
      Wire.failRepeatedStart = true;
      require(identifyAndConfigureOptical(), "ESP32 deferred read failure must recover using STOP");
    } else if (name == "transient_write") {
      Wire.transientWrites = 1;
      require(identifyAndConfigureOptical(), "transient reset write failure must recover");
    } else if (name == "absent" || name == "unreadable_identity" || name == "unknown") {
      if (name == "absent") Wire.absent = true;
      if (name == "unreadable_identity") Wire.failReadReg = 0xFF;
      if (name == "unknown") Wire.regs[0xFF] = 0xAA;
      require(!identifyAndConfigureOptical(), "missing/unknown identity must fail");
      noReady();
      require(millis() < 500, "identity failure must terminate in bounded time");
    } else if (name == "reset_timeout_100" || name == "reset_timeout_102") {
      Wire.stuckReset = true;
      require(!identifyAndConfigureOptical(), "stuck reset must fail"); noReady();
      require(millis() < 500, "stuck reset must terminate in bounded time");
    } else if (name == "write_failure_100" || name == "write_failure_102") {
      Wire.failWriteReg = max100 ? 0x07 : 0x0A;
      require(!identifyAndConfigureOptical(), "configuration write NACK must fail"); noReady();
    } else if (name == "readback_failure_100" || name == "readback_failure_102") {
      Wire.failReadReg = max100 ? 0x07 : 0x0A;
      require(!identifyAndConfigureOptical(), "configuration read failure must fail"); noReady();
    } else if (name == "mismatch_100" || name == "mismatch_102") {
      Wire.mismatchReg = max100 ? 0x09 : 0x0C;
      require(!identifyAndConfigureOptical(), "incorrect LED setting must fail read-back"); noReady();
    } else if (name == "shutdown_100" || name == "shutdown_102") {
      Wire.shutdown = true;
      require(!identifyAndConfigureOptical(), "a shutdown sensor must never become READY"); noReady();
    } else if (name == "burst_deferred_read") {
      Wire.failRepeatedStart = true;
      uint8_t bytes[6] = {};
      require(readBytes(0x57, 0x3B, bytes, 6), "idempotent burst read must recover deferred failure using STOP");
    } else if (name == "fifo_error_consumed_100" || name == "fifo_error_consumed_102") {
      require(identifyAndConfigureOptical(), "initial sensor must be ready");
      Wire.regs[max100 ? 0x02 : 0x04] = 1;
      Wire.regs[max100 ? 0x04 : 0x06] = 0;
      Wire.fifoErrorAfterConsumption = true;
      heartRateValid = spo2Valid = fingerPresent = true;
      uint32_t red = 99, ir = 99;
      bool accepted = max100 ? readMax30100Sample(red, ir) : readMax30102Sample(red, ir);
      require(!accepted, "zero-count error after FIFO consumption must not be retried into a sample");
      require(!opticalReady && !heartRateValid && !spo2Valid,
              "ambiguous FIFO failure must invalidate sensor and readings until reset");
      require(red == 99 && ir == 99, "failed FIFO transfer must not publish sample values");
      Wire.fifoErrorAfterConsumption = false; delay(2100);
      updateOpticalSensor();
      require(opticalReady, "FIFO fault must recover by full reinitialization");
    } else if (name == "fifo_partial_read") {
      require(identifyAndConfigureOptical(), "initial sensor must be ready");
      Wire.regs[0x04] = 1; Wire.regs[0x06] = 0;
      Wire.shortFifo = true;
      uint32_t red = 99, ir = 99;
      require(!readMax30102Sample(red, ir), "partial FIFO transfer must not become a sample");
      require(!opticalReady, "partial FIFO transfer must schedule reinitialization");
    } else if (name == "sos_during_init") {
      Wire.operationMs = 50;
      buttonEdges = {{100, LOW}, {280, HIGH}, {400, LOW}, {580, HIGH}, {700, LOW}, {880, HIGH}};
      require(identifyAndConfigureOptical(), "slow healthy initialization must finish");
      require(Serial.output.find("[EVENT] SOS\n") != std::string::npos,
              "three debounced clicks during initialization must emit SOS");
    } else if (name == "disconnect_recovery") {
      require(identifyAndConfigureOptical(), "initial sensor must be ready");
      heartRateValid = spo2Valid = fingerPresent = true;
      delay(1600); Wire.absent = true;
      updateOpticalSensor();
      require(!opticalReady && !heartRateValid && !spo2Valid,
              "disconnect must invalidate sensor and vital readings");
      Wire.absent = false; delay(2100);
      updateOpticalSensor();
      require(opticalReady, "reconnected sensor must reinitialize");
    } else if (name == "no_finger") {
      require(identifyAndConfigureOptical(), "initial sensor must be ready");
      processOpticalSample(0, 0);
      require(!heartRateValid && !spo2Valid && !fingerPresent, "no finger must not invent vitals");
    } else if (name == "mpu6050_ready") {
      Wire.enableMpu(0x68);
      require(initializeMpuAt(0x68), "MPU6050 must remain supported");
      require(mpuReady, "MPU6050 must become READY");
      require((Wire.mpuRegs[0x6B] & 0x40) == 0, "READY requires the SLEEP bit to be cleared");
      require((Wire.mpuRegs[0x1C] & 0x18) == 0, "READY requires the +/-2 g accelerometer range");
      require(Serial.output.find("SENSOR:MPU6050:READY") != std::string::npos,
              "MPU6050 READY must preserve its existing identity event");
    } else if (name == "mpu6500_ready") {
      Wire.enableMpu(0x70);
      require(initializeMpuAt(0x68), "WHO_AM_I 0x70 must initialize as MPU6500");
      require(mpuReady, "MPU6500 must become READY");
      require((Wire.mpuRegs[0x6B] & 0x40) == 0, "READY requires the SLEEP bit to be cleared");
      require((Wire.mpuRegs[0x1C] & 0x18) == 0, "READY requires the +/-2 g accelerometer range");
      require(Serial.output.find("SENSOR:MPU6500:READY") != std::string::npos,
              "READY must report the actual MPU6500 identity");
    } else if (name == "mpu6500_high_address") {
      Wire.enableMpu(0x70, 0x69);
      tryInitializeMpu();
      require(mpuReady && mpuAddr == 0x69, "supported MPU6500 must remain discoverable at AD0-high address 0x69");
      require(Serial.output.find("SENSOR:MPU6500:READY") != std::string::npos,
              "0x69 discovery must still report MPU6500 identity");
    } else if (name == "mpu_unknown_identity") {
      Wire.enableMpu(0x71);
      require(!initializeMpuAt(0x68), "unsupported WHO_AM_I must be rejected");
      noMpuReady();
      require(millis() < 500, "unsupported identity must terminate in bounded time");
    } else if (name == "mpu6500_config_write_failure") {
      Wire.enableMpu(0x70);
      Wire.failWriteReg = 0x1C;
      require(!initializeMpuAt(0x68), "accelerometer configuration NACK must fail initialization");
      noMpuReady();
    } else if (name == "mpu6500_config_readback_mismatch") {
      Wire.enableMpu(0x70);
      Wire.mismatchReg = 0x1C;
      require(!initializeMpuAt(0x68), "accelerometer configuration mismatch must fail read-back verification");
      noMpuReady();
    } else if (name == "mpu6500_wake_readback_mismatch") {
      Wire.enableMpu(0x70);
      Wire.mismatchReg = 0x6B;
      require(!initializeMpuAt(0x68), "sleep-bit read-back mismatch must fail initialization");
      noMpuReady();
    } else if (name == "mpu6500_reconnect") {
      Wire.enableMpu(0x70);
      require(initializeMpuAt(0x68), "initial MPU6500 must be ready");
      Wire.mpuPresent = false;
      for (int i = 0; i < 3; ++i) {
        delay(MPU_SAMPLE_INTERVAL_MS + 1);
        updateMpuFallDetection();
      }
      require(!mpuReady, "three bounded I2C failures must mark MPU unavailable");
      require(Serial.output.find("SENSOR:MPU6500:I2C_ERROR") != std::string::npos,
              "runtime error event must identify the actual MPU6500");
      Wire.mpuPresent = true;
      delay(MPU_RETRY_INTERVAL_MS + 1);
      updateMpuFallDetection();
      require(mpuReady, "reconnected MPU6500 must reinitialize");
      require(Serial.output.find("SENSOR:MPU6500:READY") != std::string::npos,
              "reconnection must restore an MPU6500 READY event");
    } else if (name == "mpu6500_sos_during_init") {
      Wire.enableMpu(0x70);
      // Stretch a healthy-but-retried initialization without altering production
      // code. Each first repeated-start read fails, then the bounded STOP retry
      // succeeds; 60 ms operations make the window long enough for 3 clicks.
      Wire.operationMs = 60;
      Wire.failRepeatedStart = true;
      buttonEdges = {{50, LOW}, {150, HIGH}, {270, LOW}, {390, HIGH}, {510, LOW}, {630, HIGH}};
      require(initializeMpuAt(0x68), "slow recovered MPU6500 initialization must finish");
      require(Serial.output.find("[EVENT] SOS\n") != std::string::npos,
              "three debounced clicks during MPU initialization must emit SOS");
      require(millis() < 1000, "slow recovered MPU initialization must remain bounded");
    } else throw std::runtime_error("unknown test case");
    std::cout << "PASS " << name << '\n';
    return 0;
  } catch (const std::exception& error) {
    if (name == "sos_during_init" || name == "mpu6500_sos_during_init") {
      std::cerr << Serial.output << "clock=" << millis() << "\n";
    }
    std::cerr << "FAIL " << name << ": " << error.what() << '\n';
    return 1;
  }
}