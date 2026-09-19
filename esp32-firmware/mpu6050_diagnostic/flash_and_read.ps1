Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " FLASHING MPU6050 DIAGNOSTIC TO ESP32 (COM5)" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Kill any blocking serial monitor
taskkill /F /IM serial-monitor.exe 2>$null

$esptool = "$env:LOCALAPPDATA\Arduino15\packages\esp32\tools\esptool_py\5.3.1\esptool.exe"
$mergedBin = "c:\Users\arif\Integrated-Women-Safety-and-Menstrual-Health\WomenSafetyApp\esp32-firmware\mpu6050_diagnostic\build\mpu6050_diagnostic.ino.merged.bin"

if (-not (Test-Path $esptool)) {
    Write-Host "Error: esptool.exe not found at $esptool" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $mergedBin)) {
    Write-Host "Error: Binary not found at $mergedBin" -ForegroundColor Red
    exit 1
}

Write-Host ">>> HOLD THE 'BOOT' BUTTON ON THE ESP32 NOW <<<" -ForegroundColor Green
Write-Host "Connecting to COM5 at 115200 baud..." -ForegroundColor Yellow
Write-Host ""

& $esptool --chip esp32 --port COM5 --baud 115200 --connect-attempts 35 write_flash 0x0 $mergedBin

if ($LASTEXITCODE -ne 0) {
    Write-Host "Flashing failed with exit code $LASTEXITCODE." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host " FLASH SUCCESS! Opening Serial Monitor at 115200 baud..." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 1

$port = New-Object System.IO.Ports.SerialPort 'COM5', 115200, 'None', 8, 'One'
$port.ReadTimeout = 1000

try {
    $port.Open()
    Write-Host "--- Resetting ESP32 into runtime mode ---" -ForegroundColor Cyan
    $port.DtrEnable = $false
    $port.RtsEnable = $true
    Start-Sleep -Milliseconds 150
    $port.DtrEnable = $false
    $port.RtsEnable = $false
    Start-Sleep -Milliseconds 500

    Write-Host "--- Reading MPU6050 Diagnostic Output (15 seconds) ---" -ForegroundColor Cyan
    $end = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $end) {
        if ($port.BytesToRead -gt 0) {
            $line = $port.ReadExisting()
            Write-Host -NoNewline $line
        }
        Start-Sleep -Milliseconds 50
    }
} finally {
    if ($port.IsOpen) {
        $port.Close()
    }
}
