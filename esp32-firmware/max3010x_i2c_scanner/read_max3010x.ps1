taskkill /F /IM serial-monitor.exe 2>$null

$port = New-Object System.IO.Ports.SerialPort 'COM5', 115200, 'None', 8, 'One'
$port.ReadTimeout = 1000

try {
    $port.Open()
    # Proven reset sequence into SPI Flash Boot
    $port.DtrEnable = $false
    $port.RtsEnable = $false
    Start-Sleep -Milliseconds 100

    $port.DtrEnable = $true
    $port.RtsEnable = $true
    Start-Sleep -Milliseconds 250

    $port.DtrEnable = $false
    $port.RtsEnable = $true
    Start-Sleep -Milliseconds 500

    $port.DtrEnable = $false
    $port.RtsEnable = $false
    Start-Sleep -Milliseconds 200

    Write-Host "--- Reading MAX3010X Diagnostic Output (15 seconds) ---" -ForegroundColor Cyan
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
