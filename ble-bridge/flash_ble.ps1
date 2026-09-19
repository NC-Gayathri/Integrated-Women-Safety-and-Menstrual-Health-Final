Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " FLASHING NAARI_KAVACH BLE FIRMWARE TO ESP32 (COM5)" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Kill any blocking serial monitor
taskkill /F /IM serial-monitor.exe 2>$null

$esptool = "$env:LOCALAPPDATA\Arduino15\packages\esp32\tools\esptool_py\5.3.1\esptool.exe"
$mergedBin = "c:\Users\arif\Integrated-Women-Safety-and-Menstrual-Health\WomenSafetyApp\esp32-firmware\esp32_firmware\build\esp32_firmware.ino.merged.bin"

if (-not (Test-Path $esptool)) {
    Write-Host "Error: esptool.exe not found at $esptool" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $mergedBin)) {
    Write-Host "Error: Binary not found at $mergedBin" -ForegroundColor Red
    exit 1
}

Write-Host "Target port: COM5" -ForegroundColor Yellow
Write-Host "Binary: $mergedBin" -ForegroundColor Yellow
Write-Host ""
Write-Host ">>> IF CONNECTING STALLS: PRESS AND HOLD THE 'BOOT' BUTTON ON THE ESP32 <<<" -ForegroundColor Green
Write-Host ""

& $esptool --chip esp32 --port COM5 --baud 460800 --connect-attempts 25 write_flash 0x0 $mergedBin

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Green
    Write-Host " SUCCESS! BLE Firmware flashed successfully." -ForegroundColor Green
    Write-Host "=======================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Upload failed with exit code $LASTEXITCODE." -ForegroundColor Red
}
