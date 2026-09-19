$port = New-Object System.IO.Ports.SerialPort 'COM5', 115200, 'None', 8, 'One'
$port.ReadTimeout = 1000
$port.Open()

Write-Output "Testing bootloader reset sequence..."

# Sequence 1: DTR=0, RTS=0
$port.DtrEnable = $false
$port.RtsEnable = $false
Start-Sleep -Milliseconds 100

# Pull EN down and IO0 down: DTR=1, RTS=1
$port.DtrEnable = $true
$port.RtsEnable = $true
Start-Sleep -Milliseconds 250

# Release EN (DTR=0) while keeping IO0 down (RTS=1)
$port.DtrEnable = $false
$port.RtsEnable = $true
Start-Sleep -Milliseconds 500

# Release IO0
$port.DtrEnable = $false
$port.RtsEnable = $false
Start-Sleep -Milliseconds 100

$output = ""
$end = (Get-Date).AddSeconds(2)
while ((Get-Date) -lt $end) {
    if ($port.BytesToRead -gt 0) {
        $output += $port.ReadExisting()
    }
    Start-Sleep -Milliseconds 50
}
$port.Close()
Write-Output "--- ESP32 Boot Output ---"
Write-Output $output
