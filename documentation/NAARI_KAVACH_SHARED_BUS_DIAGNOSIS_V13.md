# NAARI KAVACH v13: shared I²C fault closure and mathematical verification

**10 October 2026.** The goal is to diagnose and fail safely on *recurring transport failure*, not claim a broken wire is repaired by code.

## Observed real-device evidence

The supplied serial excerpt contains: a three-press sequence and genuine local `[EVENT] SOS`; optical finger attach/detach events; a short series of sample-derived HR 182→93–94 and estimated SpO₂ 97–99; then repeated alternating `MAX30102:I2C_ERROR` and `MPU6500:I2C_ERROR`. Both devices then return to `READY` before failing again. This is an intermittent two-device failure on one I²C bus (GPIO21/GPIO22), possibly including power or wiring intermittency. It does **not** prove a specific electrical cause. A `READY` event proves a successful configuration/readback *at that moment*, not sustained stability. No reset/brownout signature appears **in this excerpt**; older device captures did report brownouts. Neither absence nor presence of a brownout in this partial log can identify the present cause.

The current firmware marker was not provided in the excerpt, so the actual flashed version is **unknown**. Source and CI cannot establish which binary is installed on the ESP32.

## Software repair: shared-fault handling only

v13 identifies a shared-bus episode only after independent optical **and** motion-sensor runtime failure transitions occur within 3,000 ms and **both are unavailable**. A controller restart is suppressed for 10,000 ms after a prior shared-fault response (including a held-low line). The serial output records both GPIO line readings in failures, the I²C transmit code and received-byte count for register reads, and whether a controlled Wire end/re-begin succeeded.

- If **SDA or SCL is LOW**, v13 reports `[BUS] LINE_HELD_LOW`. It **does not** generate clock pulses or forcibly drive the line: check breakout wiring, short circuit, power, common ground, MCU/level shifter and pull-ups.
- If both lines are HIGH after correlated sensor failures, v13 attempts **one ESP32 I²C peripheral reinitialization**, restores clock and timeout configuration and marks **both sensors unavailable**. A successful `Wire.begin` is **not sensor READY**.
- In either case, SOS/BLE remain software-independent from sensor readiness, and existing two-second sensor retry procedures are preserved. A physical power failure still prevents all functions. HR/SpO₂ are invalidated; a partial fall sequence is discarded. Both devices must be reidentified and reconfigured, and their settings read back, before any new readiness claim.
- If faults recur, software retries remain bounded and expose diagnostics; v13 **does not** silently label a repeating failure as a repair.

Important: `digitalRead` sampled at the point of failure is only an instant observation, not an oscilloscope or voltage measurement; HIGH does not guarantee adequate voltage, clean edges or a device ACK.

### Regression and bounded formal checks

The production sketch is compiled against Arduino ESP32 3.3.12. The actual sketch is executed with a fake-I²C boundary, including cases where the common bus fails, one sensor alone fails, SDA is held low, controller `begin` fails, recovery is throttled and new samples are required. The optical and SOS regressions remain in the same suite.

`verification/prove_i2c_recovery.py` uses Z3 `QF_BV` 32-bit unsigned millisecond arithmetic to check 12 guard properties, including no restart with one sensor available, no restart from a single fault, no restart on a held-low line, 10-second rate limiting and wraparound. The existing 12 fall/SOS model queries remain in `verification/prove_naari.py`. `unsat` checks establish **guard logic within the stated abstract model**; they are **not** whole-program model checking. The source-drift checks reduce accidental divergence but are not a proof of model equivalence.

Commands:

```shell
python3 -m pip install z3-solver==5.1.0.0
python3 verification/prove_naari.py
python3 verification/prove_i2c_recovery.py
python3 scripts/test_naari_optical_behavior.py
python3 scripts/test_naari_vitals_behavior.py
```

CI additionally checks Android BLE parser, TypeScript/lint, firmware compile, APK build and the serial-flash-helper marker.

## Physical fault isolation: **still required**

Only work with power removed when changing physical connections. **Do not short, hot-plug or manually bridge SDA and SCL.** Never disable the ESP32 brownout detector to hide voltage problems.

1. **Verify exact live binary:** flash the protected `master` dual-sensor sketch using `ble-bridge/flash_ble.ps1` (select correct COM port). At 115200 baud, capture the entire fresh boot beginning with `[FIRMWARE] shared-bus-diagnostic-v13-20261010`.
2. **ESP32 alone:** test a known-good data USB cable and reliable USB supply for five minutes. No resets/brownouts. Measure the 3.3 V rail under load with a meter; use an oscilloscope if brief dips are suspected.
3. **MPU6500 only:** power off; wire 0x68, shared GND, SDA21, SCL22, only a supply voltage that the **exact breakout** tolerates. Confirm repeated WHO_AM_I 0x70 and stable acceleration, zero transport errors for at least five minutes.
4. **MAX30102 only:** power off; disconnect MPU, connect the optical breakout using its **verified** voltage/regulator and level-shifted I²C characteristics. Confirm PART_ID 0x15 and stable FIFO reads for five minutes. **The bare MAX30102 chip uses a 1.8 V logic rail and a separate LED rail**; never assume arbitrary cheap boards accept 5 V just from silk-screen print.
5. **Both together:** power off; reconnect both to clean short wiring and **compatible pull-ups and level shifting**. Record SDA/SCL idle levels and the 3.3 V rail **during optical LED activity**. Both modules must remain error-free for five minutes with no auto bus controller restart, no brownout, FIFO loss, or sensor resets.
6. **Functional acceptance:** with emergency actions disabled, perform uncovered 5s → stable covered finger 30s → uncovered 5s; demonstrate no stale/fabricated numbers. Three SOS clicks must be visibly received by the actual Android phone over BLE, not just printed over Serial. If fall testing is attempted, use a safe secured fixture—not a dropped tethered powered board. Prototype SpO₂/HR are **not clinical measurements**.

### Interpret the new diagnostics

| Log pattern | Interpretation / next action |
|---|---|
| `[BUS] SHARED_I2C_FAULT SDA=0 SCL=1` | SDA being held low: inspect sensor/level-shifter/reset/power. No auto clocks are generated. |
| `[BUS] SHARED_I2C_FAULT SDA=1 SCL=0` | SCL held low: inspect wiring/device, consider power-cycle under controlled conditions. |
| `[BUS] SHARED_I2C_FAULT SDA=1 SCL=1` | Lines sampled idle HIGH, but two devices still failed. Investigate pull-ups, glitches, ground, 3.3 V dips and master controller; `CONTROLLER_REINIT=OK` does not prove the electrical fault is fixed. |
| `tx=2` or `tx=5` | Address/data NACK or timeout at the transport boundary on the last attempt (consult ESP32 `Wire` return values); correlate with electrical measurements. |
| `rx=0` | The full register value was not received; may include deferred/repeated-start driver failure. |
| `SENSOR:...:READY` | Successful *momentary* re-identification and configuration, not 5-minute acceptance. |

**Safety verdict:** SOFTWARE MITIGATION AND REPRODUCIBLE ABSTRACT PROOFS, physical shared-bus/root-cause **OPEN** until a real v13 flash and measurement-backed acceptance run. No software-only formal theorem can imply that a disconnected board remains powered or electrically reliable.

Primary hardware references: [NXP UM10204 (I²C bus clear)](https://community.nxp.com/pwmxy87654/attachments/pwmxy87654/nxp-designs/931/1/UM10204.pdf), [Espressif Arduino Wire](https://github.com/espressif/arduino-esp32/blob/master/libraries/Wire/src/Wire.cpp), [Analog Devices MAX30102](https://www.analog.com/en/products/max30102.html).
