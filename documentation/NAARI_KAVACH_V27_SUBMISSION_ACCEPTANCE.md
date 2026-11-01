# NAARI KAVACH — V27 submission-critical physical acceptance (1 November 2026)

**Purpose:** A practical, falsifiable way to prove that real hardware data
arrives inside the latest native Android app, or identify the exact first
failed boundary. This is an implementation and verification handover, **not**
proof that Gayathri's ESP32/MPU/MAX30102 is electrically repaired. The last
reported V4 serial log and older APK are not acceptance evidence for V27.

## Deliverable and architecture

Official production sketch:
`esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino`

App: `services/BleService.ts` → `hooks/useIoTEmergencyListener.ts` (globally
mounted under `app/(tabs)/_layout.tsx`) →
`components/IoTEmergencyModal.tsx` and local `emergencyContacts` cache.

**One approach for this demonstration: direct BLE.** The official firmware
deliberately disables ESP32 Wi-Fi/HTTP; the separate Wi-Fi sketch and
Windows/Bleak gateway are **alternative** integrations, not prerequisites.
Do not connect nRF Connect and WomenSafetyApp simultaneously during the
app acceptance test. The PC gateway may also hold the BLE connection.

The v27 production firmware preserves the exact SOS and sensor contracts,
but adds truthful SOS transport-stage serial diagnostics:

- `[SOS] TRIGGERED` means the physical triple click was accepted locally.
- `[BLE_TX] SOS NO_CONNECTED_CLIENT; NOT_SENT` means no GATT client; nothing
  reached Android via this transaction.
- `[BLE_TX] SOS NOTIFY_REQUESTED; APP_RECEIPT_UNCONFIRMED` means the ESP32
  called the BLE notification API; **NOT** that the phone subscribed or
  actually displayed it.
- The Android app must independently show `[BLE RAW]` and
  `[BLE EVENT] Physical SOS button pressed`, followed by a local SOS
  contact modal. Neither Arduino Serial Monitor nor nRF Connect can
  substitute for this phone-side evidence.

Native BLE device: **NAARI_KAVACH**. Service UUID:
`12345678-1234-1234-1234-1234567890ab`. Notify characteristic:
`87654321-4321-4321-4321-ba0987654321`. An impostor can mimic these
identifiers; this demo does **not** provide authenticated wearable identity
or signed/attested SOS events.

## Critical release procedure (do this in order)

1. **Flash official production firmware** using an ESP32 DOIT DevKit V1,
   ESP32 Arduino core 3.3.12, 115200-baud Serial Monitor, GPIO4 SOS
   button to GND. Do not leave `naari_sensor_triage.ino` (it disables
   BLE/SOS) installed. Capture fresh `[BLE_EVIDENCE_POLICY]
   notify-request-not-app-ack-v27-20261101` and `[READY] BLE + SOS active`
   markers. No marker = wrong firmware.
2. **Install the matching Android debug APK** from the successful V27
   GitHub Actions run, artifact `naari-kavach-android-debug-apk`. Use the
   installed app, **NOT Expo Go**. Grant Android Bluetooth/Nearby Devices
   scan and connect, and any requested location permissions. Enable
   Bluetooth. Debug APKs may need the development server to run unless
   bundled; verify they actually open **offline** before demonstrating.
3. Save one **consenting test contact** under Safety → Manage Emergency
   Contacts. With the backend available, it may be server-backed; when
   unavailable, V27 saves it **on this phone only** and labels it. Neither
   path sends calls or messages without an explicit user action.
4. To test **nRF Connect**, first close/disconnect WomenSafetyApp and any
   Python Bleak gateway. In nRF Connect, scan for NAARI_KAVACH, connect,
   expand exact custom service, find exact notify characteristic, and tap
   **Enable notifications**. Press GPIO4 three times within 1.8 seconds.
   Take a screenshot of the actual UTF-8 `SOS` notification. A simple
   nRF connection is **not** sufficient. Disconnect nRF Connect afterward.
5. **Test WomenSafetyApp directly**: open the native APK foreground on
   **Home**, open IoT BLE diagnostics and confirm `Notifications
   Subscribed: YES`. The state `ESP32 FOUND` alone is not enough.
   Press GPIO4 three times within 1.8 seconds, read both serial and app
   logs, and confirm one `Hardware SOS received` modal appears immediately
   with the stored contact name/phone number. It must not open any dialer
   automatically. Explicitly tap the test contact and confirm Android's
   dialer opens with the correct number. **Do not complete a test call.**
6. Dismiss and repeat from **Safety** and **Menstrual** tabs. Turn off
   mobile internet/Wi-Fi without disabling Bluetooth, keep app foreground,
   then repeat: direct BLE SOS with locally cached contacts must not
   require the backend. Lock/background delivery is **not guaranteed**.
7. Record `[BLE RAW]`/decoded event, `SUBSCRIBED TO SENSOR NOTIFICATIONS`,
   screenshots of the modal/contact, nRF captured `SOS`, fresh serial
   transcript, app version/installation date and actual phone model.
   Mark each acceptance condition PASS or FAIL, never infer it.

## Sensor and power acceptance — separate from SOS

- Old handover includes **16 brownout messages** and two checksum warnings
  in an earlier run. Treat these as historical evidence only, but inspect
  present USB current, common ground, regulator voltage *under optical LED
  load*, I2C pull-ups, module-specific logic voltage and solder/jumper
  integrity. Power OFF to change any wiring. Check bare MAX30102 VDD 1.8V
  versus breakout VIN: **never assume** the board accepts direct 3.3/5V.
- ESP32 I2C: SDA GPIO21, SCL GPIO22, MAX30102 at 0x57 (part 0x15),
  MPU6050/6500 at 0x68/0x69 (WHO_AM_I expected 0x68/0x70).
  Sensor diagnostic V25 at 10 kHz can isolate failures but is **NOT**
  production firmware and cannot certify production 100 kHz operation.
- MPU actual acceleration READY and fall validation require a real stable
  300-second run with no repeated errors. **Never drop a powered device.**
- MAX30102 optical FIFO activity and finger placement alone are not a
  medically validated pulse. An IR reading below the application confidence
  gate (e.g. the prior reported 1205–1434 versus threshold 3000) is
  correctly **rejected**; do not lower the threshold just to print fake BPM.
  Require stable `READY`, actual `HEART_RATE`, no stale/synthetic values
  and separately document quality, contact and measurement limits.

## Evidence matrix

| Boundary | Required real-world evidence | What failure means |
| --- | --- | --- |
| Official flash | Fresh V27 boot marker | Wrong sketch is on ESP32 |
| GPIO4 press | `[SOS] TRIGGERED` | Button/debounce/power issue |
| ESP32 BLE transmit attempt | `[BLE_TX] SOS NOTIFY_REQUESTED` | No client or BLE server mismatch |
| nRF Connect independent test | Exact `SOS` on subscribed characteristic | Firmware/CCCD/notification issue |
| Actual Android GATT | `Notifications Subscribed: YES` | BLE perms/scan/device/UUID/competing client |
| Android parser | `[BLE RAW]` + SOS event | Connection or payload/decode failure |
| Android in-app alert | One global foreground modal | Listener, app version or foreground routing |
| Contact list | Correct saved number, offline | Cache/format/backend dependency |
| User-tap dialer | Selected `tel:` number, not auto-call | Android intent or number validation |
| MPU & optical separately | Actual valid readings, no brownouts | Physical wiring, power or sensor issue |

## CI and honesty boundary

The GitHub Closure Gate compiles ESP32 and the Android arm64 debug APK,
executes TypeScript tests of the real BLE service and React hook/modal
with fake native boundaries, and runs scoped Z3 models. None of this
establishes physical reception, actual phone calls/SMS, reliable
background notification, sensor accuracy, or life-safety suitability.
The device remains a **research/student prototype** until a witnessed
end-to-end test provides the required evidence.

### Date precision
The handover previously named 3 November 2026 for submission. On
1 November the user also described the submission as 'tomorrow' (2
November). Treat **2 November** as the conservative preparation deadline,
and do not assume the old date provides another day.
