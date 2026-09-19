import subprocess
import time
import sys
import os

esptool = os.path.expandvars(r"%LOCALAPPDATA%\Arduino15\packages\esp32\tools\esptool_py\5.3.1\esptool.exe")
bin_path = r"c:\Users\arif\Integrated-Women-Safety-and-Menstrual-Health\WomenSafetyApp\esp32-firmware\max3010x_identification\build\max3010x_identification.ino.merged.bin"

# 1. Kill blocking monitor
subprocess.run("taskkill /F /IM serial-monitor.exe", shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
time.sleep(0.5)

print("=" * 60)
print("UPLOADING max3010x_identification.ino TO ESP32 (COM5)...")
print(">>> PLEASE PRESS AND HOLD 'BOOT' ON THE ESP32 NOW <<<")
print("=" * 60, flush=True)

cmd = [esptool, "--chip", "esp32", "--port", "COM5", "--baud", "115200", "--connect-attempts", "35", "--after", "no-reset", "write_flash", "0x0", bin_path]
proc = subprocess.run(cmd)

if proc.returncode != 0:
    print(f"\n[UPLOAD FAILED] esptool exited with code {proc.returncode}")
    sys.exit(proc.returncode)

print("\n" + "=" * 60)
print("UPLOAD COMPLETE! Resetting ESP32 and reading Serial at 115200 baud...")
print("=" * 60, flush=True)

# 2. Kill monitor again if respawned
subprocess.run("taskkill /F /IM serial-monitor.exe", shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
time.sleep(0.5)

import serial
try:
    s = serial.Serial('COM5', 115200, timeout=1.0)
except Exception as e:
    print(f"[SERIAL ERROR] Could not open COM5: {e}")
    sys.exit(1)

# Sequence into SPI Flash Runtime Boot
s.dtr = False
s.rts = False
time.sleep(0.1)

s.dtr = True
s.rts = True
time.sleep(0.25)

s.dtr = False
s.rts = True
time.sleep(0.5)

s.dtr = False
s.rts = False
time.sleep(0.2)

print("\n--- Reading Serial Output (15 seconds) ---", flush=True)
start = time.time()
captured = ""
while time.time() - start < 15.0:
    n = s.in_waiting
    if n > 0:
        chunk = s.read(n).decode('utf-8', errors='replace')
        captured += chunk
        print(chunk, end='', flush=True)
        if "IDENTIFICATION RESULT" in captured and "-------------------------------------------------------" in captured.split("IDENTIFICATION RESULT")[-1]:
            # Allow 1 more second to flush
            time.sleep(1.0)
            if s.in_waiting > 0:
                print(s.read(s.in_waiting).decode('utf-8', errors='replace'), end='', flush=True)
            break
    time.sleep(0.05)

s.close()
