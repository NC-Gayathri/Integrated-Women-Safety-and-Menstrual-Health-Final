# NAARI KAVACH — independent software and hardware assurance ledger
Date: 9 October 2026

## Provenance and scope

Repository: `NC-Gayathri/Integrated-Women-Safety-and-Menstrual-Health-Final`
Starting protected `master` SHA: `ba5af69d36089f68b031f2e2a4a1e93f96e17ee3`
Prior master Closure Gate #114: https://github.com/NC-Gayathri/Integrated-Women-Safety-and-Menstrual-Health-Final/actions/runs/37922821659 — software build/tests successful on that SHA.
Physical serial supplied by the user booted `quiet-events-v9-20261008`, not the v10 in the original master or this v11 repair.

This ledger distinguishes source/host test results, default-branch CI, actual flash verification, and physical sensor acceptance. Green CI is *not* proof of working hardware, clinical accuracy, or field-safe SOS delivery.

## Newly identified v10 counterexamples and proposed v11 repairs

**P1 — initial cooldown.** In v10, `lastFallTriggeredAt = 0` and `now - lastFallTriggeredAt < 25000` rejected a real fall for 25 seconds after boot, even without an earlier fall. The guard now only runs after `FALL_DETECTED` has occurred. New host tests `mpu_first_fall_after_boot` and `mpu_first_fall_cooldown` exercise both the first-alert allowance and post-alert rate limit.

**P1 — missing observation continuity.** In v10, after an impact, two near-1g readings separated by an unobserved interval over 600 ms could establish supposed continuous post-impact stillness. The fall state now resets when the prior successful MPU observation is more than 150 ms old. New `mpu_postimpact_gap_rejected` reproduces a 700-ms blind interval. This is a *fail-closed heuristic*, not a demonstrated optimal threshold or a real-world sensitivity guarantee.

Existing behaviors protected by the regression suite: 3 SOS button presses in 1.8 seconds, ESP32 BLE name/UUIDs, no Wi-Fi/HTTP in acceptance sketch, MAX30100/MAX30102 part identity and verified READY, MPU6050/MPU6500 identities, verified ±8g range, optical quiet mode without finger, no fabricated vitals, bounded I2C retries and recovery.

These host tests are executable counterexample checks against selected execution paths. They are not an exhaustive machine-checked formal proof of the full firmware, mobile app, or physical electronics.

## Physical evidence observed: failure, not closure

The user's v9 log recorded:
- Multiple resets reporting `E BOD: Brownout detector was triggered`.
- MAX30102 identified as `PART_ID=0x15` at 0x57 and MPU6500 at `WHO_AM_I=0x70` / 0x68, intermittently READY and then both `I2C_ERROR`.
- A triple-button SOS and a few pulse-derived numbers. No confirmed end-to-end phone notification or reference-measurement accuracy evidence.
- A common I2C bus using ESP32 SDA GPIO21, SCL GPIO22 at 100 kHz. Shared wiring/power/bus failure is plausible but not uniquely identified.

For the classical ESP32 reference design, Espressif recommends a 3.3 V supply capable of at least 500 mA: https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32/schematic-checklist.html. The bare MAX30102 silicon uses separate 1.8 V logic and LED supply rails; the actual breakout may incorporate regulators/level shifters and must be identified before choosing VIN: https://www.analog.com/en/products/MAX30102.html. **Neither figure authorizes feeding 5 V into an unknown sensor breakout.**

## Mandatory powered-device acceptance gates

1. With power disconnected, remove both sensor modules. Connect ESP32 only with a known-good USB cable/supply. Capture five continuous minutes: zero brownouts, unwanted resets or serial corruption. Investigate the board, USB port, regulator or power path if this fails.
2. Measure the ESP32 3.3 V rail under actual load at the board. For short voltage dips use an oscilloscope (a multimeter may miss them). Confirm each sensor breakout's verified pin voltage and safe I2C pull-up voltage; do not guess board electrical ratings.
3. Power down; attach *only* MPU6500, common ground, 21/22 SDA/SCL. Require five minutes with stable ID 0x70, verified ±8g readback and zero I2C errors.
4. Power down; add the MAX30102 at 0x57. Verify wiring, solder joints, electrical ratings and pull-up arrangement. Require five minutes with both READY, no I2C errors, FIFO overflow, brownout or unexpected reset. Record the observed voltage at each module during operation.
5. Flash the latest verified protected `master` firmware using `ble-bridge/flash_ble.ps1` and the explicit actual COM port. Record physical Serial output containing `[FIRMWARE] verified-fall-timing-v11-20261009`; code or binary marker alone is insufficient.
6. Capture optical data for five seconds uncovered, 30 seconds with steady finger contact, five seconds uncovered. No fabricated readings, no idle serial spam, invalidation on removal, and live values on subscribed Android. No clinical accuracy claim without a validated reference.
7. Test triple-click SOS under normal conditions and with deliberately *simulated* optical bus failure using a safe electrically isolated fixture. Verify actual BLE delivery and app alert; do not hot-unplug loose live jumper wires. Disable real emergency calls while testing.
8. Test fall sequence using a secured, padded, strain-relieved fixture, never by dropping a loose powered/USB-attached board. Check observed accel trace, firmware event, phone BLE receipt, false-positive cases and repeated tests.

If any gate fails, the hardware reliability claim remains **OPEN**. Passing all prototype gates still does not establish clinical, production or safety-critical reliability.

## Closure invariants to check after merge

- `master` must be default and protected; list *all* refs and ensure there are no additional branches.
- Merge only an unchanged, fully tested PR head. CI must have successful ESP32 compile, host tests (including new regressions), app TypeScript/lint, Android APK and upload helper gates.
- Wait for the post-merge default-branch closure job and guarded cleanup to finish successfully; fetch master SHA and branch list again.
- If physical acceptance remains unobserved, report **SOFTWARE GATES PASSED / PHYSICAL GATES OPEN**, not overall hardware closure.
