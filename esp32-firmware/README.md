# ESP32 firmware

## Current NAARI KAVACH dual-sensor BLE firmware — 9 October 2026

For the current BLE/SOS + motion + optical integration, flash:

[`naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino`](naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino)

from the repository's current default branch, `master`.

The current Serial boot marker is:

```text
[FIRMWARE] shared-bus-diagnostic-v13-20261010
```

Idle optical reporting is event-driven in v9: with no finger present the firmware keeps sampling for health/recovery but does not print periodic LOW_LIGHT/NO_VALID_READING lines. Finger placement/removal, numeric vitals, SOS/fall, BLE transitions, and genuine sensor faults remain visible.

This firmware keeps BLE and SOS available even when a sensor is unavailable, supports both MPU6050 (`WHO_AM_I=0x68`) and MPU6500 (`WHO_AM_I=0x70`) at I2C address `0x68` or `0x69`, and only reports the motion sensor READY after wake-state and ±8 g accelerometer configuration have been read back successfully.

**Readings disappear after large signal changes?** The [v6 settling repair](../documentation/NAARI_KAVACH_SIGNAL_SETTLING.md) immediately discards estimates across a large optical baseline change, rebases the signal, and waits for stable samples before detecting fresh beats. `SETTLING` distinguishes that phase from pulse acquisition. The new guide records the latest capture's accepted readings and remaining limits.

**Repeated `[I2C] Read failed` or sensor dropouts?** The [v5 I2C recovery repair](../documentation/NAARI_KAVACH_I2C_RECOVERY.md) stops the optical retry storm, immediately clears invalid readings, waits two seconds before verified recovery, and cancels motion sequences interrupted by a bus failure. The guide records the actual failed capture and the physical acceptance requirements.

The regression suite exercises **58 sensor/SOS/fall cases and 33 signal-acquisition cases**, plus the phone's validity/SOS parser. CI also compiles the real sketch for **DOIT ESP32 DEVKIT V1** with ESP32 Arduino core **3.3.12**. These software gates do not certify a physical USB cable, ROM-loader connection, flash operation, real sensor bus or measurement accuracy.

**Both sensors READY but `VITALS:NO_VALID_READING`?** Follow the [vitals acquisition guide](../documentation/NAARI_KAVACH_VITALS_ACQUISITION.md). This version preserves pulse history between beats, uses sample timing for buffered data, clears stale values, and prints `[SIGNAL]` raw red/IR values and the acquisition reason once per reporting interval. Update the phone app as well so `VITALS:ACQUIRING` clears old displayed readings.

**Upload stuck at `Connecting...` / `No serial data received`?** Follow the [Windows/Arduino ESP32 upload recovery guide](../documentation/NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md). The verified helper is `../ble-bridge/flash_ble.ps1`; it requires an explicit port and proves ROM-loader communication with non-writing `read-mac` before it is allowed to write flash.

After a successful physical flash, the current marker above must be captured from the board at 115200 baud before claiming that this firmware is actually running.

For optical acceptance, continue with the [optical READY repair and acceptance guide](../documentation/NAARI_KAVACH_OPTICAL_READY_REPAIR.md). Motion-sensor READY, optical READY and SOS operation are separate physical evidence gates.

## Other firmware variants

The repository also contains older or purpose-specific firmware variants. They are **not substitutes for the current dual-sensor acceptance sketch** above.

- **`esp32_wifi_firmware/esp32_wifi_firmware.ino`** — Wi-Fi based SOS firmware that sends backend events over HTTP.
- **`esp32_firmware/esp32_firmware.ino`** — legacy BLE GATT firmware.
- diagnostic/scanner sketches — intentionally narrow hardware-diagnostic programs.

Do not flash a legacy binary when validating `shared-bus-diagnostic-v13-20261010`.

---

## Wi-Fi SOS variant reference

The following wiring applies to the separate Wi-Fi SOS firmware, not to the dual-sensor acceptance claim.

| Component | Component Pin | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- | :--- |
| Physical Push Button | Terminal 1 | GPIO 4 | Configured with internal pull-up (`INPUT_PULLUP`) |
| Physical Push Button | Terminal 2 | GND | Connects to GND when pressed |
| Built-in Status LED | Internal | GPIO 2 | Status indication |

To use the Wi-Fi variant, configure its Wi-Fi/backend/device credentials in that sketch, choose the correct ESP32 board and actual COM port, upload it, and inspect its own Serial output. Its runtime/network behaviour is outside the current dual-sensor BLE acceptance gate.

## Single-axis fall detection (v11)

Both WHO_AM_I=0x68 (MPU6050) and WHO_AM_I=0x70 (MPU6500) are
verified at +/-8g, 4096 LSB/g. Sampling is requested every 10ms.
A fall alert needs sustained <0.5g free fall (60-600ms), a sampled
>2.5g impact, then 600ms of continuous near-1g stillness within 2s.
These are prototype heuristics, not a clinical fall detector. A brief
impact may be missed between samples; disconnected MPU/I2C or ESP32
brownout cannot generate reliable fall evidence. Run drop demonstrations
with the **device secured in a padded fixture**, not a loose wired
sensor PCB. Never physically drop an ESP32 connected to USB or a phone.

## v11 timing safety repair

The initial 25-second period following boot is no longer incorrectly treated as a cooldown: cooldown starts only after a real fall alert. The detector also cancels a pending fall when successive successful accelerometer observations have a gap greater than 150 ms; missing samples cannot establish continuous stillness. Regression coverage includes the first fall after startup, a 700-ms motion evidence gap and a genuine post-alert cooldown. This does not fix real electrical faults or medically validate fall detection.

See the [9 October independent audit and physical acceptance ledger](../documentation/NAARI_KAVACH_FORMAL_AUDIT_2026-10-09.md).

## Mathematical safety abstraction (v12, 10 October 2026)

The v12 fix treats a zero-valued previous accelerometer timestamp as valid, preserving gap rejection across a 32-bit millisecond-counter rollover. Android BLE parsing also requires exact `SOS`/`STATUS:ONLINE` strings and complete decimal HR/SpO2 payloads. The proof runner and precise limitations are described in [formal verification assurance](../formal-verification-and-mathematical-proofs/README.md). A successful SMT query proves the described model property under its explicit assumptions, not every firmware, radio, clinical, or hardware behavior.

## Repeated two-sensor I²C failure mitigation (v13, 10 October 2026)

The newest device log shows optical MAX30102 register-read failures followed by MPU6500 I²C failures; both later report READY and fail again. This is **not** accepted physical stability. v13 logs TX/RX failure detail and current SDA/SCL pin levels, correlates two sensor errors within 3 seconds, and conditionally reinitializes the ESP32's Wire controller at most once per 10 seconds **only when both devices are down and both lines sample HIGH**. LOW bus lines are diagnosed without pulsing them. The I²C controller restart always requires independent sensor revalidation; it never manufactures an optical reading or authorizes a physical acceptance claim.

See the [v13 root-cause and physical acceptance guide](../documentation/NAARI_KAVACH_SHARED_BUS_DIAGNOSIS_V13.md) and the [machine-checked safety model](../formal-verification-and-mathematical-proofs/README.md). The actual board's firmware version is only known once its live startup log displays `[FIRMWARE] shared-bus-diagnostic-v13-20261010`.

**Complete mathematical record:** [24 numbered GitHub-rendered LaTeX formulas](../formal-verification-and-mathematical-proofs/EXACT_THEOREMS.md), [SOS counter induction](../formal-verification-and-mathematical-proofs/SOS_COUNTER_INDUCTION.md), and [executable solver setup](../formal-verification-and-mathematical-proofs/PROOF_SCOPE_AND_REPRODUCTION.md).

## v16 — observable fall stages and confidence-gated prototype BPM

The short-drop classifier accepts continuous <0.65g low-g for >=40ms, sampled >1.8g impact, then >=600ms post-impact in the **unchanged formally guarded** 0.80–1.30g band. Separate [FALL] milestones identify whether low-g, impact or stationary evidence is missing. A real phone still must receive exact `FALL_DETECTED` over subscribed BLE; serial alone is insufficient.

IR contact alone is not evidence of heart rate. A numeric BPM needs IR AC > max(10, 0.0004 × IR DC) and 3 consistent consecutive peak intervals. This is a prototype noise gate, not calibration. See the [v16 controlled hardware test procedure](../documentation/NAARI_KAVACH_V16_FALL_PULSE_ACCEPTANCE.md) and [8 additional bounded SMT model checks](../formal-verification-and-mathematical-proofs/PULSE_CONFIDENCE_C01_C08.md). v16 boot verification requires `[ALGORITHM] fall-pulse-confidence-v16-20261010` after the retained v13 boot marker.

## v17 — fail-closed controller and persistent hardware diagnostics (11 October 2026)

The earlier v13 marker is retained for backward identification, but **v17 physical verification requires** `[BUS_POLICY] failclosed-recurrence-v17-20261011` in the actual 115200-baud startup capture. The verified `ble-bridge/flash_ble.ps1` helper now checks the v17 marker in source, compiled image and physical serial output. Failed `Wire.begin` **or** `Wire.setClock` blocks all sensor I²C until a bounded controller restoration succeeds; two restart attempts within 60s then escalate to `[BUS] PERSISTENT_I2C_FAULT`. These are safety mitigations and do **not** prove stable power or wiring. Read the [v17 hardware fault isolation](../documentation/NAARI_KAVACH_V17_RECURRENCE_DIAGNOSIS.md) and [ten bounded math obligations](../formal-verification-and-mathematical-proofs/BUS_FAILCLOSED_B01_B10.md).

## v18 — bounded optical bus traffic and quiet validity transitions (11 October 2026)

A 100-Hz MAX30102/MAX30100 FIFO must not be polled thousands of times per second simply because the ESP32 main loop runs rapidly. The current test firmware checks FIFO data no more than once every 10ms while retaining a bounded two-sample drain for timing jitter; if the FIFO stalls, it limits identity verification and reconfiguration to one attempt per two seconds. Full I²C error paths still fail closed and v17 shared-controller restart limits remain in force.

The BLE `VITALS:ACQUIRING` notification now clears old published channels only on actual validity transitions. An unchanged missing or partial vital does not clear the phone display again every second; valid HR/SpO₂ channels are still reported periodically.

**Current physical flash acceptance marker:** `[FIFO_POLICY] optical-poll-vitals-v18-20261011`. Both the locally compiled merged image and actual post-flash serial startup must display this marker. Older retained v13/v16/v17 markers *by themselves* no longer identify the current firmware. The verified helper `ble-bridge/flash_ble.ps1 -Port COMx` enforces the new marker. This is a software load/notification mitigation, **not** electrical root-cause repair or proven medical/fall/BLE hardware performance. See [v17 physical fault isolation](../documentation/NAARI_KAVACH_V17_RECURRENCE_DIAGNOSIS.md).

## v19 — contiguous optical FIFO metadata, lower I²C transaction load (12 October 2026)

At 100 optical samples/second, firmware previously requested the FIFO write-pointer, overflow counter and read-pointer as three separate register reads per optical polling attempt. The MAX30102 maps them at `0x04–0x06` and the MAX30100 at `0x02–0x04`, allowing **one 3-byte sequential register burst** per poll. This reduces optical metadata transactions from three to one, preserving the FIFO sample-transfer path and the existing 10 ms poll limit. A missing/short/mid-burst read fails closed: numeric readings are discarded, the sensor becomes unavailable, and transport diagnostics report the failed register, byte count, TX/RX outcomes and sampled bus pins. The metadata snapshot is read before FIFO consumption, including overflow checks. No I²C errors are ignored and no simulated vitals are supplied.

**v19 historical flash and physical serial acceptance marker:** `[I2C_POLICY] contiguous-fifo-metadata-v19-20261012`. Earlier v13/v16/v17/v18 markers are retained only for historical diagnostics. The Windows `ble-bridge/flash_ble.ps1 -Port COMx` helper refuses stale firmware source or binaries and requires a fresh physical boot with the v19 marker. This code optimization cannot fix damaged wires, incompatible I²C pull-ups, a marginal sensor module or fluctuating power: when both sensors emit `I2C_ERROR`, perform the [v17 electrical isolation procedure](../documentation/NAARI_KAVACH_V17_RECURRENCE_DIAGNOSIS.md), first with individual sensors and then together. The `[SIGNAL] reason=ACQUIRING` state means no sufficiently consistent peaks are available; it is **not** evidence that the sensor has measured valid BPM/SpO₂.

## v21 — qualified optical contact (14 October 2026)

Current flash and physical serial acceptance marker:
`[CONTACT_POLICY] qualified-contact-v21-20261014`. Both Windows helpers require
this newest marker; the earlier boot policy lines remain for traceability.
New contact requires 20 consecutive 100 Hz frames with RED at least 5,000 and
IR at least 10,000. The lower removal thresholds still clear values immediately.
This prevents weak light near IR 3,000 from repeatedly declaring/removing a
finger. Strong contact must still pass settling and the existing pulse gates.
See [v21 evidence and physical acceptance](../documentation/NAARI_KAVACH_CONTACT_QUALIFICATION_V21.md).
