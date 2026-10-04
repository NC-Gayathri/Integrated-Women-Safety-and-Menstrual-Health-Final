#include "Arduino.h"
#include <iostream>
#include <stdexcept>
void updateButtonState();
#include "../../esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino"

void require(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

// Both verified configurations produce 100 samples/second. All artificial data
// stays in this test boundary; firmware must only consume hardware FIFO samples.
// 100 frames/beat = 60 BPM; 80 frames/beat = 75 BPM. AC/DC ratio 0.6 -> 95% in
// the project's existing, uncalibrated formula. These are algorithm fixtures.
void pulse(int frames = 1600, int period = 100, bool low = false, int batch = 1) {
  for (int i = 0; i < frames; ++i) {
    if (i % batch == 0) delay(10 * batch);
    const double wave = sin(2.0 * 3.141592653589793 * i / period);
    const uint32_t red = static_cast<uint32_t>(low ? 10000 + 8 * wave : 30000 + 300 * wave);
    const uint32_t ir = static_cast<uint32_t>(low ? 20000 + 25 * wave : 60000 + 1000 * wave);
    processOpticalSample(red, ir);
  }
}
void report() {
  Serial.output.clear();
  lastVitalsReport = millis() - 1000;
  updateOpticalSensor();
}
void noNumbers() {
  require(!heartRateValid && !spo2Valid, "invalid input must invalidate both vital estimates");
  require(Serial.output.find("[EVENT] HEART_RATE:") == std::string::npos &&
          Serial.output.find("[EVENT] SPO2:") == std::string::npos,
          "invalid input must not publish numeric vitals");
}
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  const std::string name = argv[1];
  const bool max100 = name.find("100") != std::string::npos;
  Wire.reset(max100 ? 0x11 : 0x15);
  try {
    require(identifyAndConfigureOptical(), "fixture sensor must initialize");
    Serial.output.clear();
    if (name == "clean_pulse") {
      pulse();
      require(heartRateValid && filteredBpm >= 59 && filteredBpm <= 61,
              "clean 100-frame pulse must acquire 60 BPM");
      require(spo2Valid && latestSpo2 >= 94 && latestSpo2 <= 96,
              "clean ratio fixture must acquire the existing prototype estimate");
    } else if (name == "low_amplitude_pulse") {
      pulse(1600, 100, true);
      require(heartRateValid && filteredBpm >= 59 && filteredBpm <= 61,
              "a detectable pulse must survive the envelope trough between beats");
    } else if (name == "buffered_pulse") {
      pulse(2480, 80, false, 31);
      require(heartRateValid && filteredBpm >= 74 && filteredBpm <= 76,
              "FIFO batch timing must not change a 75 BPM sampled waveform");
    } else if (name == "too_fast_pulse") {
      // 25 samples/beat at 100 sps = 250 ms = 240 BPM, beyond the supported
      // 200 BPM ceiling. The detector must reject this cadence, not ignore one
      // peak and alias every second peak into a plausible 500 ms / 120 BPM rate.
      pulse(1600, 25);
      report();
      noNumbers();
    } else if (name == "dark" || name == "flat_light") {
      for (int i = 0; i < 400; ++i) {
        delay(10);
        processOpticalSample(name == "dark" ? 0 : 30000, name == "dark" ? 0 : 60000);
      }
      noNumbers();
    } else if (name == "light_ramp") {
      for (int i = 0; i < 400; ++i) {
        delay(10); processOpticalSample(30000 + i * 5, 60000 + i * 10);
      }
      noNumbers();
    } else if (name == "finger_removed") {
      pulse(); require(heartRateValid, "fixture must first acquire a beat");
      delay(10); processOpticalSample(0, 0);
      require(!fingerPresent, "dark raw samples must end contact without waiting for DC decay");
      noNumbers();
    } else if (name == "clipped_100" || name == "clipped_102") {
      // Use raw levels below the MAX30100 full-scale limit for the healthy part.
      pulse(); require(heartRateValid, "fixture must first acquire a beat");
      delay(10); processOpticalSample(max100 ? 65535 : 262143, max100 ? 65535 : 262143);
      noNumbers();
    } else if (name == "beat_expired") {
      pulse(); require(heartRateValid, "fixture must first acquire a beat");
      for (int i = 0; i < 400; ++i) {
        delay(10); processOpticalSample(30000 + i * 5, 60000 + i * 10);
      }
      require(!heartRateValid, "a changing light level without new peaks must expire the old BPM");
    } else if (name == "samples_expired") {
      pulse(); require(heartRateValid, "fixture must first acquire a beat");
      lastOpticalSampleAt = millis();
      delay(600); report(); noNumbers();
      require(Serial.output.find("NO_VALID_READING") != std::string::npos,
              "missing fresh samples must clear stale phone vitals");
    } else if (name.rfind("reason_", 0) == 0) {
      const char* reason = "reason=NO_SAMPLES";
      if (name != "reason_no_samples") {
        for (int i = 0; i < 200; ++i) {
          delay(10);
          processOpticalSample(name == "reason_low_light" ? 100 : 30000,
                               name == "reason_low_light" ? 100 : 60000);
        }
        lastOpticalSampleAt = millis();
        reason = name == "reason_low_light" ? "reason=LOW_LIGHT" : "reason=WEAK_PULSE";
      }
      report();
      require(Serial.output.find(reason) != std::string::npos,
              "invalid-reading report must explain whether samples, light, or pulse are missing");
      require(Serial.output.find("red=") != std::string::npos &&
              Serial.output.find("ir=") != std::string::npos,
              "signal report must expose actual red/IR values for the next hardware capture");
      noNumbers();
    } else if (name == "partial_report") {
      pulse(); require(heartRateValid && spo2Valid, "fixture must first acquire both values");
      // A red channel without pulsation makes the next ratio window invalid
      // while the IR channel still supplies a valid beat interval.
      for (int i = 0; i < 100; ++i) {
        delay(10);
        processOpticalSample(30000, static_cast<uint32_t>(60000 + 1000 * sin(2.0 * 3.141592653589793 * i / 100)));
      }
      require(heartRateValid && !spo2Valid, "fixture must have fresh HR but no valid SpO2");
      report();
      const auto clear = Serial.output.find("[EVENT] VITALS:ACQUIRING");
      const auto heart = Serial.output.find("[EVENT] HEART_RATE:");
      require(clear != std::string::npos && heart != std::string::npos && clear < heart,
              "partial report must clear stale values before publishing fresh HR");
      require(Serial.output.find("[EVENT] SPO2:") == std::string::npos,
              "invalid SpO2 must not be republished");
    } else if (name == "fifo_config_mismatch") {
      Wire.mismatchReg = 0x08;
      require(!verifyOpticalConfiguration(OPTICAL_MAX30102),
              "FIFO configuration must be verified before assuming unaveraged 100 sps");
    } else if (name == "overflow_100" || name == "overflow_102") {
      pulse();
      Wire.regs[max100 ? 0x02 : 0x04] = 1;
      Wire.regs[max100 ? 0x04 : 0x06] = 0;
      Wire.regs[max100 ? 0x03 : 0x05] = 1;
      uint32_t red = 99, ir = 99;
      const bool accepted = max100 ? readMax30100Sample(red, ir) : readMax30102Sample(red, ir);
      require(!accepted && !opticalReady,
              "lost FIFO samples must reset acquisition before further timing estimates");
      require(red == 99 && ir == 99, "overflow must not expose a discontinuous sample");
      noNumbers();
    } else throw std::runtime_error("unknown case");
    std::cout << "PASS " << name << '\n';
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "FAIL " << name << ": " << error.what()
              << " (bpm=" << filteredBpm << ", valid=" << heartRateValid << ")\n";
    return 1;
  }
}
