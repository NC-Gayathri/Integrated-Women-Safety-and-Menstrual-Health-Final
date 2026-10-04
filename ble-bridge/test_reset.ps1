param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^COM\d+$')]
    [string]$Port
)

$ErrorActionPreference = 'Stop'
$serial = $null

$ports = @([System.IO.Ports.SerialPort]::GetPortNames())
if ($ports -notcontains $Port) {
    $shown = if ($ports.Count) { $ports -join ', ' } else { '<none>' }
    throw "Selected port $Port is not currently present. Available serial ports: $shown"
}

try {
    $serial = New-Object System.IO.Ports.SerialPort $Port, 115200, 'None', 8, 'One'
    $serial.ReadTimeout = 1000
    $serial.Open()

    Write-Output "Testing USB-serial reset control on $Port..."

    # Diagnostic only: this sequence exercises the adapter's DTR/RTS reset path.
    # If it does not produce boot output, use the manual BOOT + EN/RESET sequence
    # from NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md instead of repeatedly toggling it.
    $serial.DtrEnable = $false
    $serial.RtsEnable = $false
    Start-Sleep -Milliseconds 100

    $serial.DtrEnable = $true
    $serial.RtsEnable = $true
    Start-Sleep -Milliseconds 250

    $serial.DtrEnable = $false
    $serial.RtsEnable = $true
    Start-Sleep -Milliseconds 500

    $serial.DtrEnable = $false
    $serial.RtsEnable = $false
    Start-Sleep -Milliseconds 100

    $output = ''
    $deadline = (Get-Date).AddSeconds(2)
    while ((Get-Date) -lt $deadline) {
        if ($serial.BytesToRead -gt 0) { $output += $serial.ReadExisting() }
        Start-Sleep -Milliseconds 50
    }

    Write-Output '--- ESP32 Boot Output ---'
    Write-Output $output
} finally {
    if ($serial -and $serial.IsOpen) { $serial.Close() }
}
