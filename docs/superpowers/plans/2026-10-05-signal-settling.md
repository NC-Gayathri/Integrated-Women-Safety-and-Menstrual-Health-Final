# Optical signal settling implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline and one independent whole-branch review.

**Goal:** Discard old estimates and reacquire cleanly when either optical channel undergoes a large baseline change.

**Architecture:** Retain the current 100 Hz detector and transport recovery. Treat a raw channel deviation greater than 10% from its tracked DC as a discontinuity, rebase both channels, discard beat/ratio history, and require 100 subsequent stable samples before detecting beats again. This is a conservative prototype quality heuristic, not motion cancellation or medical validation.

**Tech Stack:** ESP32 Arduino 3.3.12; real-sketch C++/UBSan tests; existing BLE invalidation; GitHub Actions.

**Spec:** The user supplied `Pasted text(20261005-125514).txt`: 94 signal rows, 13 VALID reports, 15 HR events, 13 SpO2 events, one local SOS and one local fall event; no boot marker or bus/reset errors. Large level changes precede long acquisition and one retained VALID report. Once-per-second output cannot reconstruct the full 100 Hz waveform or establish medical accuracy. Physical handling and phone receipt are unknown.

## Global constraints

- Retain all PR #9 I2C/SOS protections and existing low-light/clipping/rate-aliasing rejection.
- Do not lower contact thresholds, increase LED current, change wiring or disable brownout protection.
- Use sample count for settling so FIFO delivery bursts do not shorten it.
- Emit the existing VITALS:ACQUIRING event immediately when discarding a previously valid measurement; no app protocol change.
- Preserve current diagnostics and add SETTLING to distinguish a reset baseline from attempted beat detection.

## Review focus

- Red-only, IR-only, upward and downward level changes must invalidate immediately.
- Neither a steady level nor a monotonic settling transition may invent a pulse.
- Repeated disturbances must extend settling; buffered delivery must not bypass it.
- Clean, low-amplitude, near-high-range and both-chip pulses must still acquire after settling.
- Dark/clipped/missing samples and I2C recovery must clear settling/history consistently; SOS remains independent.

### Task 1: Reproduce and repair discontinuous optical acquisition

**Files:** integration sketch; `tests/naari_optical/vitals_test.cpp`; vitals runner; current marker references in helpers/workflow/docs; new `documentation/NAARI_KAVACH_SIGNAL_SETTLING.md`.

**Interfaces:** Existing processOpticalSample and VITALS:ACQUIRING protocol; new sample-count settling state and SETTLING diagnostic.

- [ ] Write actual-sketch tests for stale estimates across large channel steps, immediate BLE clearing, flat-step rejection and reacquisition.
- [ ] Run `python3 scripts/test_naari_vitals_behavior.py` and retain expected failures before implementation.
- [ ] Add the 10% DC discontinuity guard, 100-sample settling state, rebase/history clear and immediate existing invalidation event.
- [ ] Verify step/settling fixtures, all prior 51 sensor/SOS and 19 acquisition cases, upload/cleanup contracts and BLE parser.
- [ ] Set current marker `signal-settling-v6-20261005`, document actual evidence/limits and commit.
- [ ] Obtain independent review; pass exact-head ESP32, Android, firmware and app CI; merge to master under user authorization and verify guarded branch deletion and final ancestry.
