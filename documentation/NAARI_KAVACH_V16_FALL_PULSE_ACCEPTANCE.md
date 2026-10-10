# NAARI KAVACH v16 — real-device fall and pulse acceptance

**Context: 10 October 2026.** A provided serial capture shows local 3-press SOS, changing finger-contact light levels, and one transient `HEART_RATE:150`. It shows **no** fall attempts, no proof of a phone receiving an alert, and no side-by-side reference BPM. Neither “150 was wrong” nor “a particular fall threshold was missed” can be established from the provided trace alone. Previous captures showed recurring shared I²C faults, requiring separate electrical remediation.

## 1. What v16 changes

**Fall:** the firmware recognizes repeated low-g samples below **0.65 g** lasting at least **40 ms** but no more than **600 ms**, followed by a sampled impact exceeding **1.80 g**, then continuous successful near-1g samples (`0.80 < |a| < 1.30 g`) for at least **600 ms** within **2,000 ms** after impact. Samples separated by more than **150 ms**, I²C failures, or a 25-second prior alert cooldown prevent confirmation. Every confirmed detection emits exact `FALL_DETECTED` to the local serial event and BLE notification. The earlier 0.5 g / 60 ms / 2.5 g combination could miss short or cushioned drops. These new numbers are **provisional prototype thresholds**, not a sensitivity/specificity claim and not a guarantee that dropping any module will be detected.

New diagnostic milestones:
- `[FALL] LOW_G_ENTER`: sensed low acceleration; not yet an alert
- `[FALL] IMPACT`: low-g interval followed by qualifying impact; not yet an alert
- `[FALL] CONFIRMED` and `[EVENT] FALL_DETECTED`: confirmed sequence and alert emitted

**Heart rate:** the ESP32 no longer publishes BPM after a *single* plausible peak interval. It first requires contact, completed settling, strong DC channels, a pulsatile IR AC envelope above both `10` raw counts and **0.04% of IR DC**, and **three sufficiently consistent** consecutive peak-to-peak intervals (a new interval must deviate by no more than 18% from the running candidate estimate). Intervals below 300 ms or above 2,000 ms, sample timeouts, abrupt level changes and weak pulsatility invalidate the estimate. The claimed BPM is calculated solely from timing of incoming hardware FIFO samples, not from a fixed/random generator.

For a bright contact at `IR DC = 246,000`, the minimum accepted envelope is `max(10, 0.0004×246000) = 98.4`; a logged ripple amplitude of `62` fails that necessary condition. **A number that passes this gate may still be wrong** due to motion, incorrect finger pressure, missed beats, waveform aliasing, light leakage, perfusion or sensor hardware; the prototype must be compared against an independent pulse reference.

## 2. Before physical tests

Power the sensor electronics from an electrically sound and breakout-compatible supply. Power OFF before changing connections. Validate each I²C device independently and together using [the v13 fault-isolation guide](NAARI_KAVACH_SHARED_BUS_DIAGNOSIS_V13.md), including zero recurring `I2C_ERROR` events and no brownout resets. A constantly reconnecting MAX30102/MPU6500 cannot support dependable fall detection or BPM.

Flash the latest `master` dual-sensor firmware and capture the full **115200-baud startup**, including both markers:

```text
[FIRMWARE] shared-bus-diagnostic-v13-20261010
[ALGORITHM] fall-pulse-confidence-v16-20261010
```

An old UART capture lacking the second line is **not evidence that v16 is installed**.

## 3. Fall end-to-end acceptance

Do **not** drop an untethered powered ESP32, expose a person to falling hazards, or enable emergency phone calls/texts for tests. Disconnect any external high-current circuits. Place the properly supported sensor module in a *padded, short, tethered test fixture* with safe wiring strain relief. The fixture may need testing at different heights and orientations because the measured pulse sequence depends on mechanical acceleration; record the setup so conditions are reproducible.

1. Demonstrate `SENSOR:MPU6500:READY` (or supported MPU6050) and stable I²C communication, with no resets or sensor-retry loops.
2. For a controlled low-g → impact → resting-on-cushion sequence, record the `LOW_G_ENTER`, `IMPACT`, `CONFIRMED` milestones. Verify both `[EVENT] FALL_DETECTED` **and the actual Android device receiving `FALL_DETECTED`** over subscribed BLE, with outgoing emergency actions disabled.
3. Repeat multiple controlled tests and document the number of successes *and* failures; a single positive result is insufficient for an availability claim.
4. Verify *negative controls*: ordinary gentle handling, a brief low-g jolt, isolated impact, incomplete/still-moving post-impact state, missing samples and temporary sensor disconnect **must not** falsely confirm a fall.
5. If the diagnostic log reaches `LOW_G_ENTER` but not `IMPACT`, inspect actual sampled acceleration / drop geometry instead of assuming BLE is broken. If `IMPACT` appears without `CONFIRMED`, the 600-ms stable evidence was missing or timed out. If `CONFIRMED` appears but the phone does not notify, investigate BLE subscription, Android permissions and event handling separately.

**Product limitation:** this is a tri-phase fall classifier. A slow slump, very soft catch, extremely brief fall, device held in hand, disconnected MPU or post-impact movement may not trigger it. It must not be represented as a verified human-fall detection medical/safety system.

## 4. Heart-rate acceptance with an independent reference

1. Use the stationary MAX30102 compatible breakout with a finger held gently in a consistent position; minimize arm movement and strong ambient light. Keep the device stationary while capturing at least **30 seconds** after a stable finger placement.
2. Simultaneously measure reference BPM from a reliable commercial pulse monitor or clinician-supervised manual pulse count. Timestamp both readings. Do not infer truth from the prototype's prior values.
3. Allow `VITALS:ACQUIRING` while the sensor settles and collects multiple beats. The device must not publish numeric HR from uncovered, settling, saturated, flat/constant, weakly pulsatile, or abrupt-pressure-change samples.
4. Once the stable sensor produces a rate, compare its 30-second median BPM against the synchronized independent reference. As a **prototype evaluation target**, aim for an absolute median discrepancy of **5 BPM or less** under quiet conditions, and record misses/outliers rather than discarding them. This is not a certified accuracy specification. Repeat with at least three stable trials and different finger placements.
5. Move or remove the finger: the previous BPM must be invalidated. Reposition it: the device must acquire a *fresh* multi-beat sequence before transmitting a new BPM. A changed stable pulse cadence should reacquire rather than merge an old and new rate.
6. Treat SpO₂ as **uncalibrated experimental data**, not a clinically valid oxygen saturation reading. The simplistic ratio equation is not a manufacturer calibration curve.

## 5. Software and mathematics

`tests/naari_optical/readiness_test.cpp` runs the actual firmware against simulated MPU samples and explicitly tests short controlled 2g drops and false positives. `tests/naari_optical/vitals_test.cpp` drives real sample-processing code with deterministic optical pulse waveforms, weak-ripple capture-shaped noise and cadence transitions. Neither test synthesizes on-device readings: test-only waveforms live outside the firmware.

The existing [24 Z3 model checks](../formal-verification-and-mathematical-proofs/EXACT_THEOREMS.md) remain unmodified. They prove bounded implications in an abstracted guard, **not whole-program source equivalence**, sensor calibration or physical fall detection. Live software-acceptance results and measurement-backed hardware trials are distinct evidence.

**Status before physical trials:** software regression/CI evidence is a prerequisite, **not proof of real-world performance**. Do not rely on this prototype as the sole emergency safety device.
