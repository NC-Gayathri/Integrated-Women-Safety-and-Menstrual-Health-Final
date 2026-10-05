# I2C fault recovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this bounded repair inline, then obtain one independent branch review.

**Goal:** Stop optical register failures from becoming an unbounded polling storm while preserving honest sensor health, automatic recovery, and SOS handling.

**Architecture:** Reuse the existing optical fault/reset path after an exhausted FIFO-metadata read. An empty FIFO remains a healthy no-sample result. Start each sensor's retry interval at the end of a failure, including failed initialization, so long operations cannot consume the backoff. Do not change pulse thresholds, LED current, bus pins, or brownout protection.

**Tech Stack:** ESP32 Arduino 3.3.12, C++, host boundary fakes with UBSan, existing TypeScript BLE parser, GitHub Actions.

**Spec:** The 5 October capture summarized in `documentation/NAARI_KAVACH_I2C_RECOVERY.md`; user authorizes branch, verified merge to `master`, and guarded workflow deletion.

## Global constraints

- SDA 21, SCL 22, SOS 4; 100 kHz I2C and 50 ms transaction timeout.
- Keep the two-attempt register-read fallback and single-attempt consuming FIFO reads.
- Never publish a reading after transport continuity is lost; require reset/configuration/read-back before READY.
- Keep fault events compatible with the phone's existing I2C_ERROR invalidation.
- Automated tests establish software behavior, not physical bus integrity or clinical measurement accuracy.

## Review focus

- Fast failures, as well as full timeouts, must stop polling until the retry interval expires.
- Each FIFO metadata register on MAX30100 and MAX30102 must take the same fault path.
- Empty FIFO reads and a recovered first-attempt failure must not be misclassified as sensor loss.
- Long failed initialization must still be followed by a complete backoff; both sensors must resume after reconnect.
- SOS and the healthy sensor must remain usable while the other sensor is unavailable.

### Task 1: Bounded transport-fault handling and regression proof

**Files:** sketch under `esp32-firmware/naari_kavach_dual_sensor_ble_test/`; `tests/naari_optical/fakes/Wire.h`; `tests/naari_optical/readiness_test.cpp`; `scripts/test_naari_optical_behavior.py`; firmware marker references in workflow/upload helpers/docs; new `documentation/NAARI_KAVACH_I2C_RECOVERY.md`.

**Interfaces:** Existing `readMax30100Sample`, `readMax30102Sample`, `updateOpticalSensor`, `updateMpuFallDetection`, and SENSOR events remain compatible. Hardware boundary gains fast-failure timing and transaction counters for observing driver traffic.

- [ ] Write metadata-failure cases for WR/RD/OVF on both chips; assert immediate local/BLE invalidation, no polling during 2 s backoff, verified recovery, and no reuse of stale estimates.
- [ ] Write failure-storm/SOS and MPU retry cases; assert quiet backoff even after long uptime and long failed initialization. Retain healthy-empty and repeated-start fallback checks.
- [ ] Run `python3 scripts/test_naari_optical_behavior.py`; expect new cases to fail on current firmware for missing invalidation/backoff.
- [ ] Reuse a common optical I2C fault handler for FIFO and metadata failures; timestamp retries after failure and initialization completion. Remove the unused optical error counter.
- [ ] Run all firmware, upload, cleanup, and BLE parser regressions; expect all passing. Check TypeScript/lint and real Arduino/Android builds in CI.
- [ ] Set firmware marker `i2c-recovery-v5-20261005` consistently, document the capture and bounded fix, then commit and request independent review.

### Integration

- [ ] Publish the tested tree on `fix/naari-kavach-i2c-recovery`, create the PR, and wait for all existing required jobs on its final head.
- [ ] Merge the reviewed head into `master`; wait for the full default-branch gate and guarded delete job.
- [ ] Verify merged ancestry, workflow outcome, remote branch deletion, and remaining PRs; report physical acceptance separately and truthfully.
