# NAARI KAVACH v6 post-merge evidence — 5 October 2026

This document records the repository evidence that exists **after** the v6 optical signal-settling repair was merged. It is deliberately limited to software, build, review and repository-state claims. It does not convert CI evidence into physical-device or medical-validation evidence.

## Merged revision

- Pull request: [#10 — Reset optical acquisition across large signal changes](https://github.com/NC-Gayathri/Integrated-Women-Safety-and-Menstrual-Health-Final/pull/10)
- Reviewed PR head: `7a655ea1c63953c75a79dcfe200c0ce083a2870b`
- Merge commit on `master`: `20384a06152729472db0d66518db340fe1fd5d38`
- Merged tree: `85294a44d75b1a3319db1a5038fa57b630a35a7d`
- Firmware marker carried by this revision: `[FIRMWARE] signal-settling-v6-20261005`

The merge commit has the reviewed PR head as a parent and publishes the reviewed tree.

## Exact-head pre-merge evidence

PR #10 recorded the exact reviewed head as `7a655ea1c63953c75a79dcfe200c0ce083a2870b`.

- [NAARI KAVACH Closure Gate #76](https://github.com/NC-Gayathri/Integrated-Women-Safety-and-Menstrual-Health-Final/actions/runs/37314355017): success on the reviewed head.
- [Physical Upload Recovery #17](https://github.com/NC-Gayathri/Integrated-Women-Safety-and-Menstrual-Health-Final/actions/runs/37314354896): success on the reviewed head.
- The documented host suites were 51/51 sensor/SOS cases and 30/30 acquisition cases, together with ESP32 compile, application TypeScript/lint/BLE checks, Android build, upload helpers and guarded-cleanup regressions.
- Independent review was recorded with no blocking findings before merge.

## Default-branch post-merge evidence

The merge produced `master` commit `20384a06152729472db0d66518db340fe1fd5d38`.

[NAARI KAVACH Closure Gate #77](https://github.com/NC-Gayathri/Integrated-Women-Safety-and-Menstrual-Health-Final/actions/runs/37316175702) ran on that exact `master` commit and completed successfully. Its jobs were:

1. `Firmware contract` — success.
2. `ESP32 compile` — success.
3. `App TypeScript and lint` — success.
4. `Android native BLE build` — success.
5. `Delete merged repair branch` — success.

The firmware job reran the optical READY handshake, optical fault/SOS regressions, sampled-signal/stale-reading regressions, cleanup-preservation checks, physical-upload contract and hardware/BLE invariants. The ESP32 job compiled the DOIT ESP32 DEVKIT V1 firmware and preserved its binaries/checksums. The app job reran lint, TypeScript and BLE vitals/SOS behavior checks. The Android job built the debug APK.

## Final branch inventory

After the guarded cleanup job completed, the repository branch inventory contained only:

- `master` → `20384a06152729472db0d66518db340fe1fd5d38`

The merged repair branch `fix/naari-kavach-signal-settling` was deleted by the guarded workflow using its expected-head check.

## What this closes

For the repository revision above, the available evidence supports these bounded claims:

- the reviewed v6 signal-settling implementation was merged into `master`;
- the merge publishes the reviewed tree;
- the configured firmware, ESP32, app and Android CI gates succeeded on the merged commit;
- the guarded cleanup job succeeded;
- the temporary repair branch no longer remains in the repository.

## What this does **not** close

The following still require physical evidence and are not proven by GitHub Actions or host tests:

- that a particular ESP32 currently has the v6 firmware flashed;
- stable electrical operation of the physical MAX3010x/MPU device and wiring;
- clinical accuracy of heart-rate or SpO2 values;
- real-world motion-artifact rejection beyond the bounded test cases;
- BLE receipt of an SOS event by the phone merely because Serial shows a local SOS trigger;
- end-to-end emergency delivery outside the tested software boundaries.

Physical acceptance therefore still starts by flashing the current `master`, confirming the exact v6 boot marker at 115200 baud, and then collecting the physical evidence required by the existing upload, I2C and signal-settling documentation.
