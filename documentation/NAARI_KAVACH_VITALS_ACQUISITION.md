# NAARI KAVACH vitals acquisition — 4 October 2026

The v4 acquisition repair described here is retained in v5. For the newer
5 October shared-bus fault capture and current acceptance steps, see
[I2C failure recovery](NAARI_KAVACH_I2C_RECOVERY.md).

## What the earlier hardware capture establishes

The submitted `mpu6500-ready-v3-20261004` log contains both
`SENSOR:MAX30102:READY` and `SENSOR:MPU6500:READY`. The motion sensor became
ready on retry. Sensor identification/configuration therefore succeeded in
that capture; the remaining repeated `VITALS:NO_VALID_READING` means the
firmware did not accept a vital-sign estimate. The capture has no raw optical
samples, so it does not establish the exact cause on the physical board.

## Software repair

The authoritative sketch remains
`esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino`
on `master`. The current boot marker, including the v5 recovery repair, is:

```text
[FIRMWARE] i2c-recovery-v5-20261005
```

Regression tests reproduced these defects in the previous signal path:

- Pulse history could be erased as the AC envelope fell between beats, and
  quantized peaks could be counted more than once. Contact and pulse validity
  are now separate; a new peak requires rearming across the baseline.
- Beat timing used FIFO-drain wall time. It now uses the verified 100 Hz sample
  cadence, so buffered delivery does not distort the interval. MAX30102 FIFO
  configuration is also read back before READY, and overflow resets acquisition.
- Darkness, clipped samples, missing samples and missing peaks could retain old
  estimates. Raw light loss/clipping invalidates immediately; sample gaps over
  500 ms and peak gaps over two seconds invalidate cached estimates.
- A changing light level without a detected pulse could produce a prototype
  SpO2 estimate. A valid beat is now required before accepting the ratio window.
- The phone retained old values during `VITALS:ACQUIRING`. Both the BLE service
  and safety screen now clear them. Partial reports clear the previous pair
  before publishing whichever estimate is currently valid.

LED currents, light thresholds, wiring, BLE identity and SOS gesture are
unchanged. Brownout protection remains enabled. Test waveforms exist only in
tests; production firmware reads the hardware FIFO.

## Upload and capture once

1. Update from `master` and upload the sketch above. If the loader cannot
   connect, use the [upload recovery guide](NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md).
2. Open Serial Monitor at **115200**, then press EN/RESET. Confirm the exact v5
   marker and both sensor READY events, allowing the existing retry interval.
3. Leave the optical window uncovered for five seconds. Then cover both optical
   elements with a steady finger for 30 seconds, with light contact and minimal
   movement/ambient light. Remove the finger for another five seconds.
4. Save the entire capture, including `[SIGNAL]`, sensor errors, and resets.
   Update/install the Android app from the same revision, connect BLE, and
   confirm that accepted readings appear and old readings clear after removal.
5. Exercise the real three-click SOS gesture while acquisition is active and
   confirm receipt on the phone. A Serial `SOS` alone does not prove delivery.

Both sensors already reached READY in the supplied log; this test does not
require changing the established wiring. A valid pulse is not guaranteed by
elapsed time alone. If acquisition fails, the following diagnostics identify
the next check without guessing from the generic event.

## Read the new signal diagnostic

Once per reporting interval, Serial prints:

```text
[SIGNAL] samples=... red=... ir=... red_dc=... ir_dc=... ir_ac=... age_ms=... reason=...
```

`red` and `ir` are the most recent hardware samples. `red_dc` and `ir_dc` are
filtered baselines; `ir_ac` is the filtered pulsation envelope. `samples` counts
received frames since acquisition reset. `age_ms` measures time since receipt,
not the age of a frame inside the sensor FIFO.

| Reason | Meaning and next observation |
|---|---|
| `NO_SAMPLES` | No fresh FIFO samples. Retain any FIFO/I2C error lines; this is not evidence of finger absence. |
| `LOW_LIGHT` | Raw light is below the existing contact heuristic. Check coverage and whether red/IR values respond to a finger; lighting, power or optical hardware may also be involved. |
| `WEAK_PULSE` | Light is present but the AC envelope is small. Hold steady with light contact; retain the values if this persists. |
| `SATURATED` | A channel reached the configured ADC limit. Check placement and ambient light; increasing LED current is not the remedy for clipping. |
| `ACQUIRING` | Enough light/change to attempt detection, but no accepted beat interval yet. |
| `SPO2_ACQUIRING` | Heart rate is available; the red/IR ratio window has not produced an accepted estimate. |
| `VALID` | Both estimates meet this prototype's filters. This does not establish medical accuracy. |

`NO_VALID_READING` with no finger, insufficient pulsation or invalid samples is
correct behavior. Do not suppress it or insert fixed readings to pass acceptance.

## Verification and remaining acceptance

Run from the repository root:

```sh
python3 scripts/test_naari_optical_readiness.py
python3 scripts/test_naari_optical_behavior.py
python3 scripts/test_naari_vitals_behavior.py
python3 scripts/test_naari_branch_cleanup.py
python3 scripts/test_naari_upload_recovery.py
npm ci
node scripts/test_naari_ble_vitals.cjs
npx eslint services/BleService.ts "app/(tabs)/safety.tsx"
npx tsc --noEmit -p tsconfig.naari-ci.json
```

There are 51 sensor/SOS cases and 19 acquisition cases. The latter
include known sampled pulses, low-amplitude/quantized pulses, buffered delivery,
darkness, flat light, a light ramp, removal, clipping, expiration, diagnostics,
FIFO overflow/configuration and partial reports. Artificial waveforms exercise
the real sketch through a fake hardware boundary; they do not validate a human
measurement. The parser test exercises the actual BLE service with native and
cloud boundaries stubbed. CI additionally builds the ESP32 firmware and Android
APK and parses the Windows recovery scripts.

Physical acquisition acceptance remains open until the current v5 capture and phone
behavior above are observed. Because earlier captures reported power faults,
also retain a five-minute stable-power run without brownout/checksum errors or
unexpected restarts. A recurrence requires power-path diagnosis; firmware
cannot repair a cable or regulator. The existing SpO2 approximation is
uncalibrated and is not a clinical measurement claim.

## Hardware references

- [Analog Devices MAX30102 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/max30102.pdf): FIFO overflow at 0x05, averaging at 0x08, sample rate/pulse width at 0x0A, and red/IR FIFO ordering.
- [Analog Devices MAX30100 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/max30100.pdf): overflow at 0x03, sample rate/pulse width at 0x07, and IR/red FIFO ordering.
