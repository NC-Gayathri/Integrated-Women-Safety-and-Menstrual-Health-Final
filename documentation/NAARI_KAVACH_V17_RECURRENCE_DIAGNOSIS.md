# Real-device recurrence on NAARI KAVACH — v17 firmware response and required physical repair

## Evidence from the newly supplied real-board trace

The source of this report is the new serial excerpt ending with recurring I²C outages. It **contains v13 controller diagnostics**, but not a fresh boot header with the complete algorithm/version markers. Confirm v17 physically after flashing using:

```text
[BUS_POLICY] failclosed-recurrence-v17-20261011
```

Observed before the outage: local three-click SOS printed; finger optical data with a long `VITALS:ACQUIRING` interval (not proof of valid HR/SpO₂); multiple motion low-g entries (`g=0.06` to `0.64`), which do **not** prove a real human fall and warrant checking the MPU's raw X/Y/Z values. A subsequent MAX30102 0x57 reg 0x04 read failed with `tx=4 rx=-1 SDA=1 SCL=1`; then both sensors marked I²C_ERROR, the controller reinitialized once, modules briefly revalidated, and failures recurred. Another failure was a consuming optical FIFO transfer. No accepted end-to-end phone-delivered SOS, sustained 5-minute electrical stability, or known rail-voltage measurement appears in the capture.

**Interpretation:** Arduino Wire's `endTransmission` return code **4 means other error**; 2/3 means NACK and 5 means timeout in its public API. `rx=-1` means the program **did not call requestFrom** on the final attempt (because the transmit phase failed), not that the sensor returned minus one data byte. SDA=SCL=1 are single digital GPIO samples and cannot rule out microsecond-scale glitches, weak pull-ups or rail sag. `CONTROLLER_REINIT=OK` means controller initialization succeeded in software; your trace proves that did not solve the intermittent physical/transport failure.

## Corrected software behavior (v17)

- An unsuccessful I²C controller `Wire.begin` **or** `Wire.setClock` now makes the controller unusable. Both sensor services refrain from any I²C transactions while the controller is down, and SOS remains independent.
- Restoration retries require HIGH sampled SDA/SCL, a 10-second minimum spacing and the same **two reset attempts within a 60-second epoch** as any other shared controller restart. This avoids an unlimited reset storm.
- A third correlated failure in the same 60-second window is explicitly logged as `[BUS] PERSISTENT_I2C_FAULT`, rather than interpreted as a success. Sensor-specific bounded 2-second recovery is still allowed when the controller is operational. Its momentary `READY` messages **do not prove electrical stability**.
- Every Wire controller restoration resets sensor-ready state, optical estimates and any incomplete fall. Individual devices must then reidentify and pass configuration read-back before READY.
- The firmware preserves 100 kHz SDA21/SCL22, the 50-ms I²C timeout, 0x57 MAX30102/0x68 MPU6500 addressing, brownout detection, original SOS button, and the v16 multi-beat pulse-confidence safety gate. Nothing substitutes synthetic vitals.

Proof and tests: [B01–B10 mathematically scoped model](../formal-verification-and-mathematical-proofs/BUS_FAILCLOSED_B01_B10.md); [source-host regressions](../tests/naari_optical/readiness_test.cpp) and [CI gate](../.github/workflows/naari-kavach-closure.yml). B01–B10 **do not** prove that a damaged wire or power rail can be repaired by firmware.

## Required physical fault isolation — no software-only shortcut

**Switch all power off before changing wires or modules.** Never manually bridge SDA/SCL, hot-plug devices, connect an unverified breakout to 5 V, or disable the ESP32's brownout detection.

1. Save full v17 boot log at 115200 baud including the new policy marker, before and after any reset. Photograph the actual front and reverse sides of **both sensor breakouts** so their regulator and level shifter arrangements are known. A bare MAX30102 chip requires separate 1.8 V logic and 3.3 V LED supplies; its breakout's accepted VIN and pull-up rails may differ.
2. Test the ESP32 **alone** from a known-good USB cable and supply for five minutes, including reset cause and multimeter observation of 3.3 V. A meter might miss fast dips; use a scope where available.
3. With power off, connect **only MPU6500**, short wires, sound ground, verified supply. Collect five minutes of WHO_AM_I 0x70 plus raw accelerometer X/Y/Z; stationary magnitude should be near 1g within calibration/orientation/noise limits. Persistent g=0.06 at rest is not a valid stationary baseline.
4. Power off; remove MPU and connect **only MAX30102**. Verify the actual breakout voltage and pull-ups, 0x15 ID, uninterrupted FIFO metadata and sample transfers for five minutes uncovered/covered. Verify sensor LED supply.
5. Power off and install **both** with compatible pull-ups/level shifting, shared ground, short connections, no solder bridges. Measure actual idle bus voltages and (ideally oscilloscope) SDA/SCL rising edges during optical LED activity. Two modules with their own pull-ups in parallel may draw too much current or present incompatible voltage levels.
6. Demand five full minutes **with neither I²C_ERROR nor controller restart**, zero brownouts/resets, no invalid accelerometer zero-read bursts, and reliable real Android BLE delivery of the three-click SOS in a *test configuration with emergency side effects disabled*. If any of these fail, device acceptance **fails**, regardless of transient READY states.

## What to send for the next acceptance decision

The entire fresh startup log with the policy marker and the first `[I2C]` / `[BUS]` messages; photos of both modules (both sides) and their wiring; supply labels / measured voltages while LEDs are active; individual single-module test outcomes. These facts distinguish unsafe board wiring and power defects from controller-specific transport faults, which cannot be inferred from `tx=4` alone.

Relevant authoritative references: [Espressif I²C hardware and pull-up design](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/i2c.html), [Arduino Wire endTransmission error codes](https://docs.arduino.cc/language-reference/fun%C3%A7%C3%B5es/communication/wire/endTransmission), [Analog Devices MAX30102 power requirements](https://www.analog.com/en/products/max30102.html).

**Assurance verdict:** firmware fault containment and guard verification can pass CI. Real-world hardware root cause, power quality, long-duration stability, pulse accuracy and end-to-end SOS delivery are **not formally verified** by this work.
