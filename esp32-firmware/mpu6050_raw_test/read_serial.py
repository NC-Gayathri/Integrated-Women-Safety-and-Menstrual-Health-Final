import sys
import time
import serial

try:
    ser = serial.Serial('COM5', 115200, timeout=1.0)
except Exception as e:
    print(f"Error opening COM5: {e}")
    sys.exit(1)

# Pulse EN to start running firmware
ser.dtr = False
ser.rts = True
time.sleep(0.1)
ser.rts = False
time.sleep(0.5)

lines = []
start = time.time()
print("Reading COM5 for 6 seconds...")

while time.time() - start < 6.0:
    line = ser.readline().decode('utf-8', errors='replace').strip()
    if line:
        lines.append(line)

ser.close()

if lines:
    print(f"--- Captured {len(lines)} lines (showing latest 20) ---")
    for l in lines[-20:]:
        print(l)
else:
    print("[NO_DATA_RECEIVED] (0 lines received from COM5)")
