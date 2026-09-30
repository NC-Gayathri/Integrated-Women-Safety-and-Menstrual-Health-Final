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
    } else if (name == "fifo_deferred_read") {
      Wire.failRepeatedStart = true;
      uint8_t bytes[6] = {};
      require(readBytes(0x57, 0x07, bytes, 6), "FIFO must recover deferred zero-byte read using STOP");
    } else if (name == "fifo_partial_read") {
      Wire.shortFifo = true;
      uint8_t bytes[6] = {};
      require(!readBytes(0x57, 0x07, bytes, 6), "partial FIFO transfer must not be retried into a fabricated sample");
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
    } else throw std::runtime_error("unknown test case");
    std::cout << "PASS " << name << '\n';
    return 0;
  } catch (const std::exception& error) {
    if (name == "sos_during_init") std::cerr << Serial.output << "clock=" << millis() << "\n";
    std::cerr << "FAIL " << name << ": " << error.what() << '\n';
    return 1;
  }
}
