taskkill /F /IM serial-monitor.exe 2>$null

$port = New-Object System.IO.Ports.SerialPort 'COM5', 115200, 'None', 8, 'One'
$port.ReadTimeout = 1000
$port.DtrEnable = $true
$port.RtsEnable = $false

try {
    $port.Open()
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

    $buf = ""
    $end = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $end) {
        if ($port.BytesToRead -gt 0) {
            $buf += $port.ReadExisting()
        }
        Start-Sleep -Milliseconds 50
    }

    if ($buf.Length -gt 0) {
        $lines = $buf -split "[\r\n]+" | Where-Object { $_.Trim().Length -gt 0 }
        $latest = $lines | Select-Object -Last 20
        $latest | ForEach-Object { Write-Output $_ }
    } else {
        Write-Output "[NO_DATA_RECEIVED] (0 bytes read from COM5 in 6 seconds)"
    }
} finally {
    if ($port.IsOpen) {
        $port.Close()
    }
}
