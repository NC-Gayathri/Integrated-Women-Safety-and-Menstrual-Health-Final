# V26: ESP32 hardware SOS to Android emergency contacts (25 October 2026)

**Physical acceptance remains OPEN.** Gayathri reported on 25 October that the triple-click SOS works and sensor lights are back. That does NOT yet confirm an actual BLE notification reached her phone or that calls were made.

## What V26 implements

ESP32 GPIO4 triple click -> official firmware exact SOS GATT notification -> native Android BLE client -> exact-message parser BUTTON_SOS -> global emergency listener at the tabs layout (all tabs, not Safety-only) -> immediate foreground in-app alert, even without internet -> cached emergency-contact list -> explicit user tap -> phone dialer for the chosen number.

BLE name: NAARI_KAVACH. Service UUID: 12345678-1234-1234-1234-1234567890ab. Notify characteristic: 87654321-4321-4321-4321-ba0987654321. The app must be connected and subscribed to receive a message. A GATT/name match is not cryptographic device authentication.

This does **not** automatically call anyone, send SMS, notify other phones, use the background when killed, or certify actual emergency delivery. No automatic 112 calls. It does not require IoT cloud ingestion for local SOS, and backend ingestion was already best effort without verified paired-device/API key authorization.

## Improvements

- A single listener registers before scan and persists across Home/Safety/Menstrual/other tabs.
- The exact BLE SOS protocol triggers one global modal. A second notification inside 2.5 seconds is coalesced. Subsequent distinct triggers are accepted. Local IDs are negative and never acknowledged as server records.
- Sensor failure, no optical pulse and missing internet do not suppress a received local SOS.
- Contact cache supports both modern objects containing name, phone, is_primary and legacy string-only phone arrays. Unsafe URI characters and duplicate numbers are rejected.
- User selects ONE contact. The dialer opens only after that person's tap. No countdown, multiple tel intents or emergency-services fallback.
- Safety tab no longer creates a duplicate native SOS alert or launches several dialers.

## Android hardware acceptance (record every result)

1. Flash the **official** BLE/SOS dual-sensor firmware, not the V25 stand-alone triage sketch. Confirm the fresh boot marker and the serial message that BLE + SOS are active.
2. Install a **new native Android development/debug APK** built from this V26 source. Expo Go lacks the required native BLE module. Grant Nearby Devices/Bluetooth scan and connect permissions. Enable phone Bluetooth.
3. Add one consenting **test emergency contact** on the Safety tab. Avoid using real emergency service numbers for tests.
4. Navigate to **Home** and leave the app in the foreground. Confirm BLE is actually subscribed to notifications, not merely that the ESP32 is powered.
5. Press the ESP32 GPIO4 button three times within 1.8 seconds. Confirm serial [SOS] TRIGGERED, one **Hardware SOS received** app modal, and that the saved contact's name/number appear. No dialer should open automatically.
6. Tap that contact. Confirm Android opens the dialer displaying exactly the chosen number; **do not dial during the test**.
7. Test on Safety and Menstrual tabs too. Each physical trigger should produce only one modal. Dismiss the alert and test another deliberate trigger.
8. Disable internet but keep Bluetooth enabled and app foreground. Repeat; cached contacts and BLE alert should still work.
9. Verify a remote server event, if supported, does not cause duplicate alert presentation. Do not claim remote alerts without actual backend evidence.
10. Save a complete ESP32 serial log, Android BLE status logs, contact-screen screenshot, and a signed actual-phone acceptance checklist.

## Troubleshooting

| Observed result | Likely boundary to inspect |
| --- | --- |
| Serial SOS appears but no phone alert | Official versus triage firmware; native APK versus Expo Go; app foreground; BLE connected/notifiable; Nearby Devices permissions |
| BLE subscribes but SOS not received | Exact service/characteristic UUIDs, hardware notification send, Android BLE RAW log and actual connection |
| Alert works but contacts empty | Safety contact database/cache; validate emergencyContacts local storage data |
| Contacts visible but dialer fails | Check Android tel: activity handler; contact format and explicit tap |
| Works foreground, not background/killed | **Known limitation**: background BLE and OS notification delivery are not implemented/verified |
| Only works with internet | Wrong app version or backend polling instead of direct BLE notification |

## Assurance boundary

CI executes the actual TypeScript global SOS hook and contact parser against bounded fake BLE/React/auth/cloud/Android-state interfaces. The separate Z3 abstraction checks local alert and dialer consent safety invariants with satisfiable controls. The original firmware, Android APK, TypeScript, and existing tests still need to pass. Real radio connectivity, Android activity launching, emergency calling, and physical safety are **not** formally proven by CI. A reliable wearable requires separate witnessed phone-and-board acceptance.
