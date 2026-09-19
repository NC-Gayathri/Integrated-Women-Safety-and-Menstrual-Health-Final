#!/usr/bin/env python3
"""
=============================================================================================
NAARI KAVACH - BLE TO HTTP IOT EMERGENCY GATEWAY BRIDGE
=============================================================================================
Verified Hardware & Firmware Configuration:
  - BLE Device Name              : NAARI_KAVACH
  - Device Identifier / MAC      : cc:7b:5c:fb:d9:18 (Bluetooth MAC: cc:7b:5c:fb:d9:1a)
  - Service UUID                 : 12345678-1234-1234-1234-1234567890ab
  - Notification Characteristic  : 87654321-4321-4321-4321-ba0987654321

Backend Integration Endpoint:
  - Ingestion URL                : http://127.0.0.1:5000/api/v1/iot/events
  - Authentication               : IOT_DEFAULT_DEVICE_API_KEY from server/.env
=============================================================================================
"""

import asyncio
import os
import sys
import time
import re
import argparse
import aiohttp
from pathlib import Path
from dotenv import load_dotenv
from bleak import BleakScanner, BleakClient

# Configure UTF-8 encoding on Windows to prevent charmap UnicodeEncodeError
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# -------------------------------------------------------------------------------------------
# 1. LOAD CONFIGURATION & SECRETS
# -------------------------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
SERVER_ENV_PATH = BASE_DIR / "server" / ".env"
ROOT_ENV_PATH = BASE_DIR / ".env"

if SERVER_ENV_PATH.exists():
    load_dotenv(dotenv_path=SERVER_ENV_PATH)
elif ROOT_ENV_PATH.exists():
    load_dotenv(dotenv_path=ROOT_ENV_PATH)

# Backend API Configuration
BACKEND_HOST = os.getenv("BACKEND_HOST", "http://127.0.0.1:5000").strip()
if not BACKEND_HOST.startswith("http://") and not BACKEND_HOST.startswith("https://"):
    BACKEND_HOST = f"http://{BACKEND_HOST}"
BACKEND_URL = f"{BACKEND_HOST.rstrip('/')}/api/v1/iot/events"

# Verified ESP32 Device Identifiers & GATT UUIDs
TARGET_DEVICE_NAME = os.getenv("TARGET_DEVICE_NAME", "NAARI_KAVACH").strip()
TARGET_DEVICE_ID = os.getenv("TARGET_DEVICE_ID", "cc:7b:5c:fb:d9:18").strip()
TARGET_SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab".lower()
TARGET_NOTIFY_CHAR_UUID = "87654321-4321-4321-4321-ba0987654321".lower()

# Device API Key from environment
DEVICE_API_KEY = os.getenv("IOT_DEFAULT_DEVICE_API_KEY", "nk_sec_dev_2026_9e38e_7b4c91a0ef62").strip()

# Telemetry Settings
HEARTBEAT_INTERVAL_SECONDS = 15
EVENT_COOLDOWN_SECONDS = 1.0

# Global Runtime State
seq_counter = 0
last_known_bpm = None  # Strictly populated ONLY from actual MAX30102 readings; never mock
last_event_time = {}
client_running = True

# -------------------------------------------------------------------------------------------
# 2. LOGGING HELPERS
# -------------------------------------------------------------------------------------------
def timestamp_str():
    return time.strftime("%H:%M:%S")

def log_info(msg: str):
    print(f"\033[94m[INFO {timestamp_str()}]\033[0m {msg}", flush=True)

def log_success(msg: str):
    print(f"\033[92m[SUCCESS {timestamp_str()}]\033[0m {msg}", flush=True)

def log_warn(msg: str):
    print(f"\033[93m[WARN {timestamp_str()}]\033[0m {msg}", flush=True)

def log_error(msg: str):
    print(f"\033[91m[ERROR {timestamp_str()}]\033[0m {msg}", flush=True)

def log_alert(msg: str):
    print(f"\033[95m[ALERT {timestamp_str()}]\033[0m {msg}", flush=True)

def log_stage(stage_name: str, details: str):
    print(f"\033[96m[STAGE: {stage_name} | {timestamp_str()}]\033[0m {details}", flush=True)

# -------------------------------------------------------------------------------------------
# 3. HTTP EVENT DISPATCHER
# -------------------------------------------------------------------------------------------
async def dispatch_iot_event(
    session: aiohttp.ClientSession,
    event_type: str,
    heart_rate: int = None,
    fall_detected: bool = False,
    battery_level: int = None,
) -> dict:
    global seq_counter
    seq_counter += 1

    prefix = "STAT"
    if event_type == "BUTTON_SOS":
        prefix = "BTN"
    elif event_type == "FALL_DETECTED":
        prefix = "FALL"
    elif event_type == "HEART_RATE_EMERGENCY":
        prefix = "HR"

    event_id = f"{TARGET_DEVICE_ID}_{prefix}_{int(time.time())}_{seq_counter:04d}"

    payload = {
        "deviceId": TARGET_DEVICE_ID,
        "apiKey": DEVICE_API_KEY,
        "eventId": event_id,
        "eventType": event_type,
        "fallDetected": fall_detected,
    }

    if heart_rate is not None and heart_rate > 0:
        payload["heartRate"] = heart_rate
    if battery_level is not None:
        payload["batteryLevel"] = battery_level

    headers = {
        "Content-Type": "application/json",
        "X-Device-Id": TARGET_DEVICE_ID,
        "X-Device-Key": DEVICE_API_KEY,
    }

    # Safe payload preview for logging (excluding secret key)
    safe_payload = {k: ("***REDACTED***" if k == "apiKey" else v) for k, v in payload.items()}
    log_stage("HTTP_DISPATCH", f"Target: POST {BACKEND_URL} | Payload: {safe_payload}")

    try:
        async with session.post(BACKEND_URL, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=5)) as response:
            status = response.status
            try:
                res_json = await response.json()
            except Exception:
                res_json = {"text": await response.text()}

            if status in (200, 201):
                if event_type == "STATUS_HEARTBEAT":
                    log_success(f"Backend HTTP {status} OK -> Heartbeat processed. (last_seen updated, BPM: {heart_rate or '--'})")
                else:
                    log_success(f"Backend HTTP {status} OK -> Emergency event '{event_type}' ({event_id}) successfully recorded in database!")
                    log_stage("BACKEND_RESPONSE", f"{res_json}")
                return {"success": True, "status": status, "data": res_json}
            else:
                log_error(f"Backend HTTP {status} Failed -> {res_json}")
                if status == 403:
                    log_warn("HINT: 403 Forbidden indicates the device is not yet paired with a user in the mobile app. Open the app and pair 'cc:7b:5c:fb:d9:18'.")
                elif status == 401:
                    log_warn("HINT: 401 Unauthorized indicates the API key does not match IOT_DEFAULT_DEVICE_API_KEY.")
                return {"success": False, "status": status, "data": res_json}
    except Exception as e:
        log_error(f"Network / HTTP connection error to backend at {BACKEND_URL}: {e}")
        return {"success": False, "error": str(e)}

# -------------------------------------------------------------------------------------------
# 4. BLE NOTIFICATION PROCESSING
# -------------------------------------------------------------------------------------------
def handle_ble_notification(sender, data: bytearray, session: aiohttp.ClientSession):
    global last_known_bpm, last_event_time

    try:
        raw_text = data.decode("utf-8", errors="ignore").strip()
    except Exception:
        raw_text = str(data)

    if not raw_text:
        return

    now = time.time()
    log_stage("BLE_NOTIFICATION", f"Sender: {sender} | Raw Bytes: {bytes(data)} | Text: '{raw_text}'")

    # 1. SOS Notification Handler
    if "SOS" in raw_text.upper():
        if now - last_event_time.get("BUTTON_SOS", 0) > EVENT_COOLDOWN_SECONDS:
            last_event_time["BUTTON_SOS"] = now
            log_alert("[EMERGENCY] PHYSICAL SOS BUTTON EVENT DETECTED ('SOS')! Forwarding BUTTON_SOS to backend...")
            asyncio.create_task(
                dispatch_iot_event(
                    session=session,
                    event_type="BUTTON_SOS",
                    heart_rate=last_known_bpm,
                    fall_detected=False,
                )
            )
        else:
            log_warn(f"Duplicate SOS notification within {EVENT_COOLDOWN_SECONDS}s ignored.")

    # 2. Fall Detection Handler
    elif "FALL" in raw_text.upper():
        if now - last_event_time.get("FALL_DETECTED", 0) > EVENT_COOLDOWN_SECONDS:
            last_event_time["FALL_DETECTED"] = now
            log_alert("[ALERT] FALL DETECTED EVENT ('FALL_DETECTED')! Forwarding FALL_DETECTED to backend...")
            asyncio.create_task(
                dispatch_iot_event(
                    session=session,
                    event_type="FALL_DETECTED",
                    heart_rate=last_known_bpm,
                    fall_detected=True,
                )
            )
        else:
            log_warn(f"Duplicate Fall notification within {EVENT_COOLDOWN_SECONDS}s ignored.")

    # 3. Status Online Handler
    elif "STATUS:ONLINE" in raw_text.upper():
        log_success("ESP32 reported 'STATUS:ONLINE' - Gateway link verified!")
        asyncio.create_task(
            dispatch_iot_event(
                session=session,
                event_type="STATUS_HEARTBEAT",
                heart_rate=last_known_bpm,
                fall_detected=False,
            )
        )

    # 4. Heart Rate Telemetry Handler ("HEART_RATE:<BPM>" or "HR:<BPM>" or numeric)
    elif "HEART_RATE" in raw_text.upper() or "HR:" in raw_text.upper() or raw_text.isdigit():
        match = re.search(r"(\d+)", raw_text)
        if match:
            bpm = int(match.group(1))
            if 30 <= bpm <= 230:
                last_known_bpm = bpm
                log_info(f"[HEART_RATE] Live Heart Rate received from ESP32: {bpm} BPM")

                # Forward as routine heartbeat
                asyncio.create_task(
                    dispatch_iot_event(
                        session=session,
                        event_type="STATUS_HEARTBEAT",
                        heart_rate=bpm,
                        fall_detected=False,
                    )
                )

                # Abnormal BPM detection (e.g. >130 or <45)
                if (bpm < 45 or bpm > 130) and (now - last_event_time.get("HEART_RATE_EMERGENCY", 0) > 30):
                    last_event_time["HEART_RATE_EMERGENCY"] = now
                    log_alert(f"[ALERT] ABNORMAL HEART RATE ({bpm} BPM)! Forwarding HEART_RATE_EMERGENCY to backend...")
                    asyncio.create_task(
                        dispatch_iot_event(
                            session=session,
                            event_type="HEART_RATE_EMERGENCY",
                            heart_rate=bpm,
                            fall_detected=False,
                        )
                    )
    else:
        log_info(f"Unhandled BLE notification payload: '{raw_text}'")

# -------------------------------------------------------------------------------------------
# 5. PERIODIC HEARTBEAT TASK
# -------------------------------------------------------------------------------------------
async def periodic_heartbeat_task(session: aiohttp.ClientSession):
    while client_running:
        try:
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)
            if client_running:
                log_info(f"Sending periodic background heartbeat (BPM: {last_known_bpm or '--'})...")
                await dispatch_iot_event(
                    session=session,
                    event_type="STATUS_HEARTBEAT",
                    heart_rate=last_known_bpm,
                    fall_detected=False,
                )
        except asyncio.CancelledError:
            break
        except Exception as e:
            log_warn(f"Heartbeat loop exception: {e}")

# -------------------------------------------------------------------------------------------
# 6. SCAN & CONNECT TO ESP32 (Multi-attribute matching: Service UUID, Name, or MAC)
# -------------------------------------------------------------------------------------------
async def find_esp32_device(timeout: float = 6.0):
    log_stage("BLE_SCAN", f"Scanning for '{TARGET_DEVICE_NAME}' / UUID: '{TARGET_SERVICE_UUID}' (Timeout: {timeout}s)...")
    try:
        discovered = await BleakScanner.discover(timeout=timeout, return_adv=True)
    except Exception as e:
        log_error(f"BleakScanner scan error: {e}")
        return None

    # Normalization helper
    target_prefix = TARGET_DEVICE_ID.replace(":", "").lower()[:10]  # "cc7b5cfbd9"

    for addr, (dev, adv) in discovered.items():
        name = (dev.name or adv.local_name or "").strip()
        addr_clean = dev.address.replace(":", "").lower()
        adv_uuids = [str(u).lower() for u in (adv.service_uuids or [])]

        # Multi-attribute match:
        # 1. Exact Advertised Service UUID match (Highest precision)
        # 2. Advertised Name / Device Name contains "NAARI_KAVACH"
        # 3. MAC address prefix match (handles both cc:7b:5c:fb:d9:18 and Bluetooth MAC cc:7b:5c:fb:d9:1a)
        is_uuid_match = TARGET_SERVICE_UUID in adv_uuids
        is_name_match = TARGET_DEVICE_NAME.lower() in name.lower()
        is_mac_match = (
            TARGET_DEVICE_ID.lower() == dev.address.lower()
            or target_prefix in addr_clean
        )

        if is_uuid_match or is_name_match or is_mac_match:
            match_reason = "UUID" if is_uuid_match else ("Name" if is_name_match else "MAC")
            log_stage(
                "BLE_DISCOVERED",
                f"Match: [{match_reason}] | Device Name: '{name}' | Address: [{dev.address}] | RSSI: {adv.rssi} dBm | UUIDs: {adv_uuids}"
            )
            return dev

    return None

async def run_gateway_bridge():
    global client_running

    print("=" * 75)
    print("      NAARI KAVACH - BLE TO HTTP IOT EMERGENCY GATEWAY BRIDGE")
    print(f"  Target Device Name      : {TARGET_DEVICE_NAME}")
    print(f"  Device Identifier / MAC : {TARGET_DEVICE_ID}")
    print(f"  Service UUID            : {TARGET_SERVICE_UUID}")
    print(f"  Notify Char UUID        : {TARGET_NOTIFY_CHAR_UUID}")
    print(f"  Backend Ingestion URL   : {BACKEND_URL}")
    print("=" * 75)

    if not DEVICE_API_KEY:
        log_warn("No IOT_DEFAULT_DEVICE_API_KEY found in server/.env! Backend authentication may fail.")
    else:
        log_success("Device API key successfully loaded from environment.")

    async with aiohttp.ClientSession() as session:
        while client_running:
            try:
                device = await find_esp32_device(timeout=5.0)
                if not device:
                    log_warn(f"Device '{TARGET_DEVICE_NAME}' not found in BLE scan. Retrying in 4 seconds...")
                    await asyncio.sleep(4)
                    continue

                log_stage("BLE_CONNECTING", f"Connecting to {device.name or TARGET_DEVICE_NAME} [{device.address}]...")

                async with BleakClient(device, timeout=15.0) as client:
                    if not client.is_connected:
                        log_warn("Connection attempt failed. Retrying in 3 seconds...")
                        await asyncio.sleep(3)
                        continue

                    log_stage("BLE_CONNECTED", f"Successfully connected to {TARGET_DEVICE_NAME} [{device.address}]!")

                    # Find and subscribe to the explicit notification characteristic
                    subscribed = False
                    callback = lambda sender, data: handle_ble_notification(sender, data, session)

                    # Iterate over services and characteristics
                    for service in client.services:
                        s_uuid = str(service.uuid).lower()
                        for char in service.characteristics:
                            c_uuid = str(char.uuid).lower()
                            props = char.properties

                            # Exact match on verified characteristic UUID
                            if c_uuid == TARGET_NOTIFY_CHAR_UUID or TARGET_NOTIFY_CHAR_UUID in c_uuid:
                                try:
                                    await client.start_notify(char.uuid, callback)
                                    log_stage("BLE_SUBSCRIBED", f"Subscribed to TARGET Characteristic: {char.uuid} ({service.description})")
                                    subscribed = True
                                except Exception as e:
                                    log_error(f"Failed to subscribe to target characteristic {char.uuid}: {e}")
                            elif "notify" in props or "indicate" in props:
                                # Fallback subscription if matching service
                                if s_uuid == TARGET_SERVICE_UUID:
                                    try:
                                        await client.start_notify(char.uuid, callback)
                                        log_stage("BLE_SUBSCRIBED", f"Subscribed to Service Characteristic: {char.uuid}")
                                        subscribed = True
                                    except Exception as e:
                                        log_warn(f"Could not subscribe to {char.uuid}: {e}")

                    if not subscribed:
                        log_warn(f"Target characteristic {TARGET_NOTIFY_CHAR_UUID} not found in GATT tree. Attempting fallback subscription to any notify characteristic...")
                        for service in client.services:
                            for char in service.characteristics:
                                if "notify" in char.properties or "indicate" in char.properties:
                                    try:
                                        await client.start_notify(char.uuid, callback)
                                        log_stage("BLE_SUBSCRIBED", f"Fallback subscription on: {char.uuid}")
                                        subscribed = True
                                    except Exception:
                                        pass

                    if subscribed:
                        log_success(f"Gateway Bridge is ACTIVE, Connected to ESP32, and listening for emergency events!")
                    else:
                        log_error("Failed to subscribe to any notification characteristic!")

                    # Start periodic background heartbeat to keep device ONLINE in backend
                    heartbeat_task = asyncio.create_task(periodic_heartbeat_task(session))

                    # Send immediate initial heartbeat to immediately flip mobile card from OFFLINE to ONLINE
                    await dispatch_iot_event(session, "STATUS_HEARTBEAT", heart_rate=last_known_bpm)

                    # Monitor connection loop
                    while client.is_connected and client_running:
                        await asyncio.sleep(1)

                    log_warn("ESP32 BLE connection dropped! Cancelling heartbeat and reconnecting...")
                    heartbeat_task.cancel()

            except Exception as e:
                log_error(f"Gateway bridge exception: {e}")
                log_info("Reconnecting in 4 seconds...")
                await asyncio.sleep(4)

# -------------------------------------------------------------------------------------------
# 7. DIAGNOSTIC MANUAL TEST MODE
# -------------------------------------------------------------------------------------------
async def run_manual_test(event_type: str, heart_rate: int = 75, fall_detected: bool = False):
    print("=" * 70)
    print(f"  DIAGNOSTIC TEST DISPATCH: {event_type}")
    print(f"  Backend Ingest URL      : {BACKEND_URL}")
    print(f"  Device Identifier       : {TARGET_DEVICE_ID}")
    print("=" * 70)

    async with aiohttp.ClientSession() as session:
        result = await dispatch_iot_event(
            session=session,
            event_type=event_type,
            heart_rate=heart_rate,
            fall_detected=fall_detected,
        )
        print("\nTest Result:", result)

async def run_interactive_mode():
    print("=" * 70)
    print("  NAARI KAVACH - INTERACTIVE DIAGNOSTIC CONSOLE")
    print("  Commands:")
    print("    sos       - Send simulated BUTTON_SOS event")
    print("    fall      - Send simulated FALL_DETECTED event")
    print("    hr <bpm>  - Send simulated HEART_RATE telemetry (e.g. hr 88)")
    print("    stat      - Send simulated STATUS_HEARTBEAT")
    print("    quit      - Exit console")
    print("=" * 70)

    async with aiohttp.ClientSession() as session:
        while True:
            try:
                line = await asyncio.to_thread(input, "\n[Test-Console]> ")
                cmd = line.strip().lower()
                if not cmd:
                    continue
                if cmd in ("quit", "exit", "q"):
                    break
                elif cmd == "sos":
                    log_alert("Dispatching simulated BUTTON_SOS event...")
                    await dispatch_iot_event(session, "BUTTON_SOS", heart_rate=last_known_bpm, fall_detected=False)
                elif cmd == "fall":
                    log_alert("Dispatching simulated FALL_DETECTED event...")
                    await dispatch_iot_event(session, "FALL_DETECTED", heart_rate=last_known_bpm, fall_detected=True)
                elif cmd.startswith("hr"):
                    parts = cmd.split()
                    bpm = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 85
                    log_info(f"Dispatching simulated HEART_RATE telemetry: {bpm} BPM...")
                    await dispatch_iot_event(session, "STATUS_HEARTBEAT", heart_rate=bpm, fall_detected=False)
                elif cmd == "stat":
                    log_info("Dispatching simulated STATUS_HEARTBEAT...")
                    await dispatch_iot_event(session, "STATUS_HEARTBEAT", heart_rate=last_known_bpm, fall_detected=False)
                else:
                    print("Unknown command. Valid options: sos, fall, hr <bpm>, stat, quit")
            except (KeyboardInterrupt, EOFError):
                break

# -------------------------------------------------------------------------------------------
# 8. ENTRY POINT
# -------------------------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Naari Kavach BLE-to-HTTP Gateway Bridge")
    parser.add_argument("--test-sos", action="store_true", help="Send a simulated BUTTON_SOS event to backend and exit")
    parser.add_argument("--test-fall", action="store_true", help="Send a simulated FALL_DETECTED event to backend and exit")
    parser.add_argument("--test-heartbeat", type=int, metavar="BPM", help="Send a simulated STATUS_HEARTBEAT with given BPM and exit")
    parser.add_argument("--interactive", action="store_true", help="Start interactive CLI test console without BLE scanning")

    args = parser.parse_args()

    try:
        if args.test_sos:
            asyncio.run(run_manual_test("BUTTON_SOS", heart_rate=88, fall_detected=False))
        elif args.test_fall:
            asyncio.run(run_manual_test("FALL_DETECTED", heart_rate=80, fall_detected=True))
        elif args.test_heartbeat is not None:
            asyncio.run(run_manual_test("STATUS_HEARTBEAT", heart_rate=args.test_heartbeat, fall_detected=False))
        elif args.interactive:
            asyncio.run(run_interactive_mode())
        else:
            asyncio.run(run_gateway_bridge())
    except KeyboardInterrupt:
        client_running = False
        print("\n[INFO] BLE Bridge stopped by user.")
        sys.exit(0)
