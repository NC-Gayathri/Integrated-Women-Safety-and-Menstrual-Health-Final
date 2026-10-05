param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^COM\d+$')]
    [string]$Port,

    [ValidateRange(3, 120)]
    [int]$Seconds = 15
)

$ErrorActionPreference = 'Stop'
$ExpectedMarker = '[FIRMWARE] signal-settling-v6-20261005'
$serial = $null
$markerSeen = $false

$ports = @([System.IO.Ports.SerialPort]::GetPortNames())
if ($ports -notcontains $Port) {
    $shown = if ($ports.Count) { $ports -join ', ' } else { '<none>' }
    throw "Selected port $Port is not currently present. Available serial ports: $shown"
}

try {
    $serial = New-Object System.IO.Ports.SerialPort $Port, 115200, 'None', 8, 'One'
    $serial.ReadTimeout = 250
    $serial.DtrEnable = $false
    $serial.RtsEnable = $false
    $serial.Open()

    Write-Host "Listening on $Port at 115200 baud for $Seconds seconds." -ForegroundColor Cyan
    Write-Host 'With BOOT released, tap EN/RESET once now.' -ForegroundColor Yellow

    $deadline = (Get-Date).AddSeconds($Seconds)
    $buffer = ''
    while ((Get-Date) -lt $deadline) {
        if ($serial.BytesToRead -gt 0) {
            $buffer += $serial.ReadExisting()
            while ($buffer.Contains("`n")) {
                $split = $buffer.Split(@("`n"), 2, [System.StringSplitOptions]::None)
                $line = $split[0].TrimEnd("`r")
                $buffer = $split[1]
                Write-Host "[ESP32 SERIAL] $line"
                if ($line -eq $ExpectedMarker) { $markerSeen = $true }
            }
        }
        Start-Sleep -Milliseconds 50
    }

    if ($buffer.Length -gt 0) {
        $line = $buffer.TrimEnd("`r", "`n")
        Write-Host "[ESP32 SERIAL] $line"
        if ($line -eq $ExpectedMarker) { $markerSeen = $true }
    }
} finally {
    if ($serial -and $serial.IsOpen) { $serial.Close() }
}

if (-not $markerSeen) {
    Write-Host "Expected marker was not observed: $ExpectedMarker" -ForegroundColor Red
    Write-Host 'Do not claim the verified firmware is running on the physical board.' -ForegroundColor Yellow
    exit 2
}

Write-Host "Verified physical boot marker: $ExpectedMarker" -ForegroundColor Green
exit 0
