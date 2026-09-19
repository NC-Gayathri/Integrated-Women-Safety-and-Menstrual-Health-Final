import serial
import time
import subprocess

subprocess.run("taskkill /F /IM serial-monitor.exe", shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)

s = serial.Serial('COM5', 115200, timeout=1)

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

print("--- Reading from COM5 (15 seconds) ---")
start = time.time()
while time.time() - start < 15:
    n = s.in_waiting
    if n > 0:
        chunk = s.read(n).decode('utf-8', errors='replace')
        print(chunk, end='', flush=True)
    time.sleep(0.05)

s.close()
