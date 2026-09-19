import serial
import time
import subprocess

subprocess.run("taskkill /F /IM serial-monitor.exe", shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
time.sleep(0.3)

try:
    ser = serial.Serial('COM5', 115200, timeout=1.0)
except Exception as e:
    print(f"Error opening COM5: {e}")
    exit(1)

# Leave lines unasserted
ser.dtr = False
ser.rts = False

print("=" * 60)
print("Listening on COM5 (20 seconds)...")
print(">>> PLEASE PRESS THE 'EN' (RST) BUTTON ON YOUR ESP32 NOW <<<")
print("=" * 60, flush=True)

start = time.time()
while time.time() - start < 20.0:
    line = ser.readline().decode('utf-8', errors='replace')
    if line:
        print(line, end='', flush=True)

ser.close()
