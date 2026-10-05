# I2C failure recovery — 5 October 2026

The v5 repair introduced `[FIRMWARE] i2c-recovery-v5-20261005`. It remains
included in the current [v6 signal-settling build](NAARI_KAVACH_SIGNAL_SETTLING.md).
Use the dual-sensor sketch on `master`; the previous sensor compatibility,
upload recovery, and vitals acquisition fixes remain included.

## What the supplied capture proves

The complete `Pasted text(20261005-060019).txt` capture contains:

- 663 failed optical register reads: 661 at `0x04` and two at `0x05`.
- Three MPU6500 I2C-error transitions and three optical FIFO overflows.
- Repeated recovery to both sensors' READY states.
- 38 signal reports and 38 `VITALS:NO_VALID_READING` events. Ordinary fresh
  samples are below the current IR contact threshold; one report is stale
  and the final report has no samples after reinitialization.
- No boot, reset, or brownout message within this excerpt. Earlier brownouts
  do not establish the cause of these particular I2C failures.

This is evidence of intermittent transport failure affecting both sensors,
alongside insufficient optical signal. It does not identify a specific faulty
cable, jumper, power rail, module, or controller. Sensor READY means verified
configuration, not a usable pulse or a continuously stable bus.

## Reproduced software defects and repair

An exhausted optical FIFO-pointer/counter read used to return the same result
as a healthy empty FIFO. The main loop kept polling, often hundreds of times,
without immediately marking the sensor unavailable. Delayed FIFO draining
could then lose samples. The unused optical error counter did not protect this
path. Both MAX30100 and MAX30102 now enter the existing fault/recovery path
after the bounded register retries fail:

1. Discard optical sample/beat/ratio history immediately.
2. Emit chip-specific `I2C_ERROR`, which clears cached HR/SpO2 in the phone.
3. Stop optical reads for two seconds, measured from failure completion.
4. Re-identify, reset, configure and verify read-back before READY. Require
   fresh samples to produce new estimates. Repeat bounded recovery if the
   underlying fault persists.

An ordinary empty FIFO remains healthy, and a successful STOP fallback remains
accepted. Consuming FIFO reads still are not retried after ambiguous failure.

The MPU's runtime failure now starts a full retry interval; failed initialization
of either sensor also starts its interval at completion. Previously an old
retry timestamp could cause an immediate additional attempt. A motion read
failure also cancels an incomplete fall sequence: reconnecting a stationary
board must not complete a pre-fault impact and generate a false fall alert.

The bus pins, 100 kHz clock, 50 ms transaction timeout, LED current, light
thresholds, and brownout protection are unchanged. This repair bounds faulty
traffic and restores operation when communication returns; it cannot repair an
electrical connection or create a pulse signal absent from the sensor.

## Verification evidence

The real sketch runs against a controlled hardware boundary, including fast
zero-delay failures and full timeouts. The new fault-regression cases failed before their
respective fixes and passed afterward; healthy-buffer/fallback controls also pass. The sensor suite has **51 cases**:
the prior 33 plus 18 covering all FIFO metadata registers on both chips,
empty FIFO/fallback preservation, retry intervals, shared faults with SOS,
isolation of a healthy MPU, and interrupted fall sequences. The separate
**19-case** acquisition suite continues to reject darkness, clipping, stale
samples, excessive beat rates and incomplete measurements.

Run the firmware regressions and existing upload/cleanup contracts:

```sh
python3 scripts/test_naari_optical_readiness.py
python3 scripts/test_naari_optical_behavior.py
python3 scripts/test_naari_vitals_behavior.py
python3 scripts/test_naari_branch_cleanup.py
python3 scripts/test_naari_upload_recovery.py
```

The existing closure workflow additionally checks the phone parser, TypeScript
and lint, compiles with ESP32 Arduino 3.3.12, and builds the Android APK. Its
guarded delete job removes the merged repair branch only after all four
default-branch jobs succeed and its unchanged merged head is verified.

## One physical acceptance run

Upload this version using the [existing upload helper](NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md)
and capture the current marker at 115200 baud. Keep the full log and the phone
connected throughout a five-minute run. Require no I2C failures, FIFO overflows,
brownouts, checksum errors, or unexpected resets. During the stable run, record
five seconds uncovered, 30 seconds with a steady finger covering both optical
elements, then five seconds uncovered. Verify fresh readings on the phone,
clearing after removal, and receipt of the real three-click SOS gesture.

If I2C errors recur, the firmware will recover with a pause instead of flooding
the bus. That is a failed physical acceptance result, even if READY returns.
Disconnect power before changing wiring. Check solder joints, SDA21/SCL22,
common ground and the module supply under load locally; isolate each module
on the same short, sound connections to identify which addition causes the
shared bus to fail. Earlier power instability warrants checking the USB supply
path too. Do not increase VIN to 5 V based only on `MAX30100/30102` silkscreen:
the breakout's regulator/pull-up circuit and permitted VIN must be established.

Only after transport is stable can the covered/uncovered optical response be
assessed. `LOW_LIGHT` is not itself proof of a broken algorithm or a particular
power fault. If a steady finger does not raise the signal above the contact
threshold, verify the actual module's LED supply and optical hardware locally.
The MAX30102 chip specifies separate logic and LED rails; a responsive I2C
interface alone does not verify LED power. Do not suppress invalid-reading
events or lower the contact threshold to manufacture acceptance.

Software closure is supported by regression/build evidence. Full physical
closure requires the run above. The prototype SpO2 approximation remains
uncalibrated; a `VALID` event is not a clinical accuracy claim.

## Primary references

- [Espressif Arduino I2C API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/i2c.html): bounded timeout and read-return semantics.
- [MAX30102 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/max30102.pdf): FIFO pointers/counter and separate logic/LED supplies.
- [MAX30100 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/max30100.pdf): chip-specific FIFO register mapping.
