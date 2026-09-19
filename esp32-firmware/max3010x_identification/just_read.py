import subprocess
import time
import sys
import serial

# 1. Kill any blocking process
subprocess.run("taskkill /F /IM serial-monitor.exe", shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
time.sleep(0.5)

try:
    s = serial.Serial('COM5', 115200, timeout=1.0)
except Exception as e:
    print(f"Error opening COM5: {e}")
    sys.exit(1)

print("=" * 60)
print("Resetting ESP32 into runtime mode...")
print("=" * 60, flush=True)

# Proven reset sequence into SPI Flash Runtime Boot
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

print("\n--- Reading MAX3010X Identification Output ---", flush=True)
start = time.time()
captured = ""
while time.time() - start < 20.0:
    n = s.in_waiting
    if n > 0:
        chunk = s.read(n).decode('utf-8', errors='replace')
        captured += chunk
        print(chunk, end='', flush=True)
    time.sleep(0.05)

s.close()
