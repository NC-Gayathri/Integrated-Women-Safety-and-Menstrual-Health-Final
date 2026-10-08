#!/usr/bin/env python3
"""Static contract for the Windows ESP32 physical-upload recovery path.

This does not pretend to test a USB cable or real ESP32 in CI. It prevents the
repository from directing a user to a stale firmware marker, fixed COM port,
unsafe high-speed first retry, or the wrong legacy binary.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FIRMWARE = ROOT / 'esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino'
README = ROOT / 'esp32-firmware/README.md'
RECOVERY = ROOT / 'documentation/NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md'
OPTICAL = ROOT / 'documentation/NAARI_KAVACH_OPTICAL_READY_REPAIR.md'
FLASH = ROOT / 'ble-bridge/flash_ble.ps1'
SERIAL = ROOT / 'ble-bridge/read_com5.ps1'
RESET = ROOT / 'ble-bridge/test_reset.ps1'
WORKFLOW = ROOT / '.github/workflows/naari-kavach-closure.yml'

files = [FIRMWARE, README, RECOVERY, OPTICAL, FLASH, SERIAL, RESET, WORKFLOW]
for path in files:
    assert path.is_file(), f'missing required upload/recovery file: {path}'

firmware = FIRMWARE.read_text(encoding='utf-8')
match = re.search(r'Serial\.println\("\[FIRMWARE\] ([^"]+)"\);', firmware)
assert match, 'firmware must expose a serial build marker'
marker = match.group(1)
assert marker == 'quiet-events-v9-20261008', f'unexpected current marker: {marker}'
expected_line = f'[FIRMWARE] {marker}'

for path in [README, RECOVERY, OPTICAL]:
    text = path.read_text(encoding='utf-8')
    assert expected_line in text, f'{path} must require the current firmware marker'
    assert 'optical-ready-v2-20260930' not in text, f'{path} still advertises obsolete firmware'

flash = FLASH.read_text(encoding='utf-8')
assert re.search(r'param\s*\(', flash, re.I), 'flash helper must accept explicit parameters'
assert re.search(r'\$Port\b', flash), 'flash helper must use an explicit Port parameter'
assert 'COM5' not in flash, 'flash helper must not hard-code COM5'
assert '460800' not in flash, 'first recovery upload must not force 460800 baud'
assert '115200' in flash, 'recovery path must use conservative 115200 baud'
assert 'naari_kavach_dual_sensor_ble_test' in flash, 'flash helper must target the verified dual-sensor sketch'
assert 'esp32_firmware.ino.merged.bin' not in flash, 'flash helper must never flash the legacy BLE binary'
read_mac_pos = flash.lower().find('read-mac')
write_pos = flash.lower().find('write-flash')
assert read_mac_pos >= 0, 'flash helper must prove ROM-loader communication with read-mac before writing'
assert write_pos > read_mac_pos, 'write-flash must occur only after the read-mac preflight'
assert 'no-reset' in flash.lower(), 'manual BOOT/EN recovery must preserve selected download mode'
assert 'Assert-SourceMarker' in flash, 'flash helper must reject stale local firmware source before compiling'
assert 'Assert-CompiledImageMarker' in flash, 'flash helper must inspect the compiled image before writing it'
assert 'ReadAllBytes' in flash, 'compiled-image marker verification must inspect the actual merged binary bytes'
assert 'Verify-FlashedFirmwareMarker' in flash, 'flash helper must verify the real post-flash serial boot automatically'
assert 'SerialPort' in flash, 'post-flash verification must read the physical serial port'
assert 'exit 3' in flash, 'missing post-flash marker must fail closed instead of reporting success'

for path in [SERIAL, RESET]:
    text = path.read_text(encoding='utf-8')
    assert re.search(r'param\s*\(', text, re.I), f'{path} must be parameterized'
    assert re.search(r'\$Port\b', text), f'{path} must use the caller-selected port'
    assert 'COM5' not in text, f'{path} must not hard-code COM5'

workflow = WORKFLOW.read_text(encoding='utf-8')
assert 'python3 scripts/test_naari_upload_recovery.py' in workflow, 'closure gate must run upload-recovery contract'
assert 'pull_number: 6' not in workflow, 'cleanup must not be permanently bound to an obsolete PR number'
assert 'listPullRequestsAssociatedWithCommit' in workflow, 'cleanup must derive the merged repair PR from the verified merge commit'

print('NAARI physical upload recovery contract PASS')
