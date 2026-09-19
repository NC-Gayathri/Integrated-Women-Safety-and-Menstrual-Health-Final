import asyncio
import sys
from bleak import BleakScanner, BleakClient

TARGET_NAME = "NAARI_KAVACH"
TARGET_SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab".lower()
TARGET_CHAR_UUID = "87654321-4321-4321-4321-ba0987654321".lower()

def notification_callback(sender, data: bytearray):
    try:
        text = data.decode("utf-8", errors="ignore").strip()
    except Exception:
        text = str(data)
    print(f"\n[BLE INCOMING] Sender: {sender} | Data: '{text}' (raw: {bytes(data)})")

async def main():
    print("==================================================")
    print("BLE DIAGNOSTIC SCANNER & NOTIFICATION TEST")
    print(f"Target Name        : {TARGET_NAME}")
    print(f"Target Service UUID: {TARGET_SERVICE_UUID}")
    print(f"Target Char UUID   : {TARGET_CHAR_UUID}")
    print("==================================================\n")

    print("[1] Starting BLE Scan (10 seconds)...")
    try:
        discovered = await BleakScanner.discover(timeout=10.0, return_adv=True)
    except Exception as e:
        print(f"[ERROR] BleakScanner.discover failed: {e}")
        return

    print(f"[2] Discovered {len(discovered)} nearby BLE device(s):")
    target_device = None

    for addr, (dev, adv) in discovered.items():
        name = dev.name or adv.local_name or "Unknown"
        uuids = [str(u).lower() for u in (adv.service_uuids or [])]
        print(f"  - [{dev.address}] Name: '{name}' | RSSI: {adv.rssi} dBm | Services: {uuids}")

        if TARGET_NAME.lower() in name.lower() or TARGET_SERVICE_UUID in uuids:
            target_device = dev
            print(f"    >>> FOUND MATCH FOR {TARGET_NAME}! <<<")

    if not target_device:
        print(f"\n[RESULT] Device '{TARGET_NAME}' was NOT discovered in the 10-second scan.")
        print("Troubleshooting checklist:")
        print("  1. Is the ESP32 powered ON and running BLE firmware?")
        print("  2. Is ESP32 within Bluetooth range of this laptop?")
        print("  3. Is another device (e.g. phone or another laptop) currently connected to the ESP32?")
        print("     (ESP32 stops advertising when an active BLE connection is held).")
        return

    print(f"\n[3] Connecting to {target_device.name} [{target_device.address}] (timeout 15s)...")
    try:
        async with BleakClient(target_device, timeout=15.0) as client:
            if not client.is_connected:
                print("[ERROR] Connection failed!")
                return

            print(f"[4] CONNECTED to {target_device.name}!")
            print("\n[5] Discovering GATT Services and Characteristics:")
            target_char_found = False

            for service in client.services:
                s_uuid = str(service.uuid).lower()
                is_target_service = (s_uuid == TARGET_SERVICE_UUID)
                flag = " [*** TARGET SERVICE ***]" if is_target_service else ""
                print(f"\n  Service: {service.uuid} ({service.description}){flag}")

                for char in service.characteristics:
                    c_uuid = str(char.uuid).lower()
                    is_target_char = (c_uuid == TARGET_CHAR_UUID)
                    if is_target_char:
                        target_char_found = True
                    c_flag = " [*** TARGET NOTIFY CHAR ***]" if is_target_char else ""
                    print(f"    Characteristic: {char.uuid} | Properties: {char.properties}{c_flag}")

            if not target_char_found:
                print(f"\n[WARN] Characteristic {TARGET_CHAR_UUID} not found directly in GATT tree.")
                return

            print(f"\n[6] Subscribing to Notifications on {TARGET_CHAR_UUID}...")
            await client.start_notify(TARGET_CHAR_UUID, notification_callback)
            print("[7] Subscribed! Listening for incoming BLE messages for 25 seconds...")
            print("    (Try triggering button click, fall, or pulse sensor on the ESP32 now)")

            for sec in range(25, 0, -5):
                print(f"    ...listening ({sec}s remaining)...")
                await asyncio.sleep(5)

            await client.stop_notify(TARGET_CHAR_UUID)
            print("\n[8] Stopped notifications. Disconnecting cleanly...")

        print("[9] Disconnected cleanly.")
    except Exception as e:
        print(f"[ERROR] Exception during connection/communication: {e}")

if __name__ == "__main__":
    asyncio.run(main())
