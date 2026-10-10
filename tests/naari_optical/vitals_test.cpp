#include "Arduino.h"
#include <iostream>
#include <stdexcept>
void updateButtonState();
#include "../../esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino"

void require(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

size_t occurrences(const std::string& haystack, const std::string& needle) {
  size_t count = 0;
  size_t pos = 0;
  while ((pos = haystack.find(needle, pos)) != std::string::npos) {
    ++count;
    pos += needle.size();
  }
  return count;
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

void levelPulse(uint32_t redDcLevel, uint32_t irDcLevel, int frames = 1000) {
  for (int i = 0; i < frames; ++i) {
    delay(10);
    const double wave = sin(2.0 * 3.141592653589793 * i / 100);
    processOpticalSample(static_cast<uint32_t>(redDcLevel * (1.0 + 0.006 * wave)),
                         static_cast<uint32_t>(irDcLevel * (1.0 + 0.010 * wave)));
  }
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
    } else if (name == "early_bpm_is_not_valid") {
      pulse(280, 100);
      noNumbers();
      require(consistentBeatIntervals < HEART_MIN_CONSISTENT_INTERVALS,
              "one/two pulse intervals are not sufficient evidence for HR");
      pulse(1600, 100);
      require(heartRateValid && filteredBpm >= 59 && filteredBpm <= 61,
              "four or more consistent beats must eventually acquire the true 60 BPM fixture");
    } else if (name == "bright_flat_ripple_rejected") {
      // Mirrors the ~246k-DC, ~62-AC weak oscillation from the real serial log.
      // A bright stationary contact must not yield HEART_RATE:150 from noise.
      for (int i = 0; i < 1600; ++i) {
        delay(10);
        const double wave = sin(2.0 * 3.141592653589793 * i / 40);
        processOpticalSample(static_cast<uint32_t>(223000 + 70 * wave),
                             static_cast<uint32_t>(246000 + 65 * wave));
      }
      report();
      noNumbers();
      require(irEnvelope < fmax(OPTICAL_MIN_IR_ENVELOPE,
                                irDc * OPTICAL_MIN_IR_AC_FRACTION),
              "weak bright optical ripple should fail the DC-relative pulse floor");
    } else if (name == "stable_75_after_60_cadence_change") {
      pulse(1600, 100);
      require(heartRateValid && filteredBpm >= 59 && filteredBpm <= 61,
              "must first establish true 60 BPM");
      pulse(400, 80);
      require(heartRateValid && filteredBpm >= 74 && filteredBpm <= 76,
              "a changed stable 75 BPM cadence must be reacquired, not averaged into 67 BPM");
    } else if (name == "irregular_transients_not_valid") {
      // Alternate true-looking but mutually inconsistent pulse periods.
      // All samples are from this host-only test fixture, never generated
      // inside the ESP32 firmware.
      const int periods[] = {60, 110, 65, 125, 55, 100, 130, 70};
      int index = 0, phase = 0;
      for (int i = 0; i < 1600; ++i) {
        delay(10);
        const int period = periods[index % 8];
        const double wave = sin(2.0 * 3.141592653589793 * phase / period);
        processOpticalSample(static_cast<uint32_t>(30000 + 300 * wave),
                             static_cast<uint32_t>(60000 + 1000 * wave));
        if (++phase >= period) { phase = 0; ++index; }
      }
      report();
      noNumbers();
      require(consistentBeatIntervals < HEART_MIN_CONSISTENT_INTERVALS,
              "inconsistent interbeat intervals must never be treated as a stable BPM");
    } else if (name == "step_red" || name == "step_ir" || name == "step_up" ||
               name == "step_red_100" || name == "step_ir_100") {
      pulse(); require(heartRateValid && spo2Valid, "fixture must first acquire valid estimates");
      const bool redOnly = name.rfind("step_red", 0) == 0;
      const uint32_t red = redOnly || name == "step_up" ? 45000 : 30000;
      const uint32_t ir = redOnly ? 60000 : name == "step_up" ? 90000 : 45000;
      Serial.output.clear();
      delay(10); processOpticalSample(red, ir);
      noNumbers();
      require(Serial.output.find("[EVENT] VITALS:ACQUIRING") != std::string::npos,
              "a level discontinuity must immediately clear the phone's old measurement");
      require(std::string(opticalSignalReason()) == "SETTLING",
              "a rebased signal must identify its settling phase");
      for (int i = 0; i < 100; ++i) { delay(10); processOpticalSample(red, ir); }
      noNumbers();
      require(fabs(redDc - red) < 1 && fabs(irDc - ir) < 1,
              "a flat new level must rebase promptly, not retain the old DC tail");
      levelPulse(red, ir);
      require(heartRateValid && filteredBpm >= 59 && filteredBpm <= 61 && spo2Valid,
              "a fresh pulse at the new baseline must reacquire both estimates");
    } else if (name == "settling_repeated_steps" || name == "settling_buffered") {
      pulse(); require(heartRateValid && spo2Valid, "fixture must first acquire valid estimates");
      delay(10); processOpticalSample(200000, 240000);
      noNumbers();
      for (int i = 0; i < 99; ++i) {
        if (name == "settling_buffered") { if (i % 31 == 0) delay(310); }
        else delay(10);
        processOpticalSample(200000, 240000);
      }
      require(std::string(opticalSignalReason()) == "SETTLING",
              "settling must require a full sample interval, including buffered delivery");
      if (name == "settling_repeated_steps") {
        delay(10); processOpticalSample(150000, 180000);
        for (int i = 0; i < 99; ++i) { delay(10); processOpticalSample(150000, 180000); }
        require(std::string(opticalSignalReason()) == "SETTLING",
                "a second disturbance must restart the settling interval");
      }
      noNumbers();
    } else if (name == "high_baseline_pulse") {
      levelPulse(209000, 242000);
      require(heartRateValid && filteredBpm >= 59 && filteredBpm <= 61 && spo2Valid,
              "a small pulse at the capture's high baseline must remain detectable");
    } else if (name == "settling_report") {
      Serial.output.clear();
      delay(10); processOpticalSample(200000, 240000);
      require(Serial.output.find("[FINGER] DETECTED") != std::string::npos &&
              Serial.output.find("[EVENT] VITALS:ACQUIRING") != std::string::npos,
              "new contact must announce one acquisition transition");
      report();
      noNumbers();
      require(Serial.output.find("reason=SETTLING") != std::string::npos &&
              Serial.output.find("[EVENT] VITALS:ACQUIRING") == std::string::npos,
              "settling diagnostics may print while contact exists but must not repeat BLE ACQUIRING");
    } else if (name == "settling_samples_expired") {
      delay(10); processOpticalSample(200000, 240000);
      delay(600); report(); noNumbers();
      require(std::string(opticalSignalReason()) == "NO_SAMPLES" &&
              Serial.output.find("[FINGER] REMOVED (sample timeout)") != std::string::npos &&
              Serial.output.find("[EVENT] VITALS:NO_VALID_READING") != std::string::npos,
              "missing samples must emit one removal/clear transition and retain NO_SAMPLES diagnostics");
    } else if (name == "step_flat_high_to_low") {
      levelPulse(209000, 242000);
      require(heartRateValid && spo2Valid, "fixture must acquire at the capture's high baseline");
      Serial.output.clear();
      delay(10); processOpticalSample(5449, 10413);
      noNumbers();
      for (int i = 0; i < 800; ++i) { delay(10); processOpticalSample(5449, 10413); }
      noNumbers();
      require(std::string(opticalSignalReason()) == "WEAK_PULSE",
              "a flat bright background must settle without being mistaken for a pulse");
    } else if (name == "low_amplitude_pulse") {
      pulse(1600, 100, true);
      require(heartRateValid && filteredBpm >= 59 && filteredBpm <= 61,
              "a detectable pulse must survive the envelope trough between beats");
    } else if (name == "weak_contact_noise") {
      // Physical 5 Oct capture after contact degraded: raw channels remained just
      // above the old contact gate (~3-5k) and small optical ripple was enough
      // to produce partial HR events. That weak-contact region must never mature
      // into a numeric vital.
      for (int i = 0; i < 1600; ++i) {
        delay(10);
        const double wave = sin(2.0 * 3.141592653589793 * i / 80);
        processOpticalSample(3500, static_cast<uint32_t>(3900 + 120 * wave));
      }
      require(!heartRateValid && !spo2Valid,
              "weak-contact optical ripple must not become a vital estimate");
      report();
      noNumbers();
      require(std::string(opticalSignalReason()) == "WEAK_CONTACT",
              "weak-contact rejection must be explicit in diagnostics");
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
    } else if (name == "quiet_no_finger") {
      Serial.output.clear();
      for (int i = 0; i < 400; ++i) {
        delay(10);
        processOpticalSample(2300, 2200);
      }
      report();
      noNumbers();
      require(Serial.output.find("[SIGNAL]") == std::string::npos &&
              Serial.output.find("VITALS:NO_VALID_READING") == std::string::npos &&
              Serial.output.find("VITALS:ACQUIRING") == std::string::npos,
              "uncovered sensor must remain quiet instead of emitting periodic idle vitals");
    } else if (name == "finger_transition_events") {
      for (int i = 0; i < 20; ++i) {
        delay(10); processOpticalSample(2300, 2200);
      }
      Serial.output.clear();
      delay(10); processOpticalSample(30000, 60000);
      for (int i = 0; i < 20; ++i) {
        delay(10); processOpticalSample(30000, 60000);
      }
      require(occurrences(Serial.output, "[FINGER] DETECTED") == 1 &&
              occurrences(Serial.output, "[EVENT] VITALS:ACQUIRING") == 1,
              "one finger placement must emit exactly one detected/acquiring transition");
      Serial.output.clear();
      delay(10); processOpticalSample(2300, 2200);
      for (int i = 0; i < 20; ++i) {
        delay(10); processOpticalSample(2300, 2200);
      }
      require(occurrences(Serial.output, "[FINGER] REMOVED") == 1 &&
              occurrences(Serial.output, "[EVENT] VITALS:NO_VALID_READING") == 1,
              "one finger removal must emit exactly one removal/clear transition");
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
      // Runtime idle logging is quiet in v9; explicit diagnostics still expose
      // the complete reason/raw signal when intentionally requested in tests.
      Serial.output.clear();
      reportOpticalSignal();
      require(Serial.output.find(reason) != std::string::npos,
              "explicit signal diagnostics must preserve the reason code");
      require(Serial.output.find("red=") != std::string::npos &&
              Serial.output.find("ir=") != std::string::npos,
              "explicit diagnostics must expose actual red/IR values");
      noNumbers();
    } else if (name == "partial_report") {
      pulse(); require(heartRateValid && spo2Valid, "fixture must first acquire both values");
      // A red channel without pulsation makes the next ratio window invalid
      // while the IR channel still supplies a valid beat interval.
      // Two complete windows guarantee a pure flat-red ratio window regardless
      // of how startup settling aligned the preceding fixture's window.
      for (int i = 0; i < 200; ++i) {
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
