#include "Arduino.h"
#include <iostream>
#include <stdexcept>
#include <string>
// Compile the EXACT deployed Arduino triage source, not a test reimplementation.
#include "../../esp32-firmware/naari_sensor_triage/naari_sensor_triage.ino"

void require(bool value, const char* message) {
  if (!value) throw std::runtime_error(message);
}
void runToEnd() {
  // Delay/testClock comes from the fake Arduino boundary, never wall time.
  while (!testFinished && millis() < 45000) loop();
  require(testFinished, "30-second triage must terminate");
}
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  const std::string test = argv[1];
  Wire.reset(0x15);
  try {
    if (test == "no_sensors_no_false_ready") {
      Wire.absent = true;
      Wire.failureMs = 0;
      setup();
      runToEnd();
      require(Serial.output.find("[TRIAGE_MPU] NOT_READY") != std::string::npos,
              "absent MPU must be recorded");
      require(Serial.output.find("[TRIAGE_OPTICAL] NO_ACK") != std::string::npos,
              "absent optical device must be recorded");
      require(opticalSamples == 0 && mpuSamples == 0 && !opticalReady && !mpuReady,
              "no sensors must not create fabricated samples or READY");
      require(Serial.output.find("[TRIAGE_SUMMARY]") != std::string::npos,
              "even complete sensor absence must end with an evidence summary");
    } else if (test == "mpu6500_and_real_fifo_path") {
      Wire.enableMpu(0x70);
      Wire.simulateFreshOpticalFifo = true;
      setup();
      require(mpuReady && opticalReady && opticalConfigured,
              "valid identity, reset and register readback establish configuration");
      // The mock FIFO frames are deliberately enabled ONLY inside this test.
      Wire.regs[0x04] = 1;
      Wire.regs[0x06] = 0;
      runToEnd();
      require(opticalSamples >= 25 && opticalNonzero > 0 && mpuSamples >= 5,
              "test must consume complete fresh optical and MPU register frames");
      require(!opticalConfigured &&
              Serial.output.find("[TRIAGE_SHUTDOWN] VERIFIED") != std::string::npos,
              "diagnostic must exit with a verified shutdown");
      require(Serial.output.find("not proof of physical light") != std::string::npos,
              "register test must never claim verified photons");
      require(Serial.output.find("FALL_DETECTED") == std::string::npos,
              "diagnostic samples do not justify fabricating emergency falls");
    } else if (test == "optical_fifo_read_fault") {
      setup();
      require(opticalConfigured && opticalReady, "optical configuration must start verified");
      Wire.regs[0x04] = 1;
      Wire.failReadReg = 0x07;
      runToEnd();
      require(!opticalReady && opticalErrors > 0 && opticalSamples == 0,
              "FIFO read error invalidates optical state and samples");
      require(Serial.output.find("[TRIAGE_OPTICAL] FIFO_READ_FAIL") != std::string::npos,
              "error must identify the failed FIFO stage");
      require(Serial.output.find("[TRIAGE_SHUTDOWN] VERIFIED") != std::string::npos,
              "loss of optical READY must not remove the duty to shut down emitters");
    } else if (test == "fifo_empty_no_fabrication") {
      setup();
      runToEnd();
      require(opticalReady && opticalSamples == 0 && opticalNonzero == 0,
              "configured device with empty FIFO may not invent samples");
      require(Serial.output.find("optical_samples=0 nonzero=0") != std::string::npos,
              "empty FIFO must be explicit in final evidence");
    } else if (test == "mpu_accel_fault_isolated") {
      Wire.enableMpu(0x70);
      Wire.simulateFreshOpticalFifo = true;
      setup();
      require(mpuReady && opticalReady, "both sensors initially configured");
      Wire.regs[0x04] = 1; Wire.regs[0x06] = 0;
      Wire.failReadReg = 0x3B;
      runToEnd();
      require(!mpuReady && mpuSamples == 0 && mpuErrors > 0,
              "no acceleration bytes may count as a motion sample");
      require(opticalSamples > 0,
              "a failed MPU sample must not sabotage healthy optical telemetry");
      require(Serial.output.find("FALL_DETECTED") == std::string::npos,
              "an MPU transport fault must never become a fall");
    } else if (test == "mpu6500_high_address") {
      Wire.enableMpu(0x70, 0x69);
      setup();
      require(mpuReady && mpuAddr == 0x69, "MPU6500 at AD0-high 0x69 must work");
    } else if (test == "unsupported_optical_part") {
      Wire.reset(0x11);
      setup();
      require(!opticalReady && !opticalConfigured,
              "MAX30100 cannot be configured using MAX30102 registers");
      require(Serial.output.find("NOT_MAX30102") != std::string::npos,
              "unsupported optical identity must be explained");
    } else if (test == "controller_failure_blocks_all_io") {
      Wire.beginOk = false;
      setup();
      require(!busReady && testFinished && Wire.transactions == 0,
              "failed Wire.begin must block every sensor transfer");
      require(Serial.output.find("BUS_INIT_FAILED") != std::string::npos,
              "failed controller requires a clear actionable result");
    } else throw std::runtime_error("unknown test name");
    std::cout << "PASS " << test << '\n';
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "FAIL " << test << ": " << error.what() << '\n'
              << Serial.output.substr(0, 3500) << '\n';
    return 1;
  }
}
