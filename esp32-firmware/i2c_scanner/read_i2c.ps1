# Kill any background serial monitor
taskkill /F /IM serial-monitor.exe 2>$null

$port = New-Object System.IO.Ports.SerialPort 'COM5', 115200, 'None', 8, 'One'
$port.ReadTimeout = 1000
$port.DtrEnable = $true
$port.RtsEnable = $false

try {
    $port.Open()
    Write-Host "--- Resetting ESP32 into runtime mode ---" -ForegroundColor Cyan
    $port.DtrEnable = $false
    $port.RtsEnable = $true
    Start-Sleep -Milliseconds 150
    $port.DtrEnable = $false
    $port.RtsEnable = $false
    Start-Sleep -Milliseconds 500

    Write-Host "--- Reading I2C Scanner Output from COM5 (15 seconds) ---" -ForegroundColor Cyan
    $end = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $end) {
        if ($port.BytesToRead -gt 0) {
            $text = $port.ReadExisting()
            Write-Host -NoNewline $text
        }
        Start-Sleep -Milliseconds 50
    }
} finally {
    if ($port.IsOpen) {
        $port.Close()
    }
}
