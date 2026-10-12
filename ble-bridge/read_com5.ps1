param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^COM\d+$')]
    [string]$Port,

    [ValidateRange(3, 900)]
    [int]$Seconds = 15,

    [string]$OutputPath,

    [switch]$RequireTransportStable
)

$ErrorActionPreference = 'Stop'
$ExpectedMarker = '[I2C_POLICY] contiguous-fifo-metadata-v19-20261012'
$serial = $null
$writer = $null
$script:markerSeen = $false
$script:opticalReadySeen = $false
$script:mpuReadySeen = $false
$script:transportFaults = 0
$script:opticalSamples = 0

# Serial lines, not build output, provide independent evidence of what booted.
function Accept-SerialLine {
    param([string]$Line)
    Write-Host "[ESP32 SERIAL] $Line"
    if ($null -ne $script:writer) { $script:writer.WriteLine($Line) }
    if ($Line -eq $ExpectedMarker) { $script:markerSeen = $true }
    if ($Line -match '^\[EVENT\] SENSOR:MAX3010[02]:READY$') {
        $script:opticalReadySeen = $true
    }
    if ($Line -match '^\[EVENT\] SENSOR:MPU(6050|6500):READY$') {
        $script:mpuReadySeen = $true
    }
    if ($Line -match '^\[SIGNAL\] samples=') { ++$script:opticalSamples }
    if ($Line -match '^\[I2C\]' -or
        $Line -match '^\[BUS\] (SHARED_I2C_FAULT|PERSISTENT_I2C_FAULT|LINE_HELD_LOW|CONTROLLER_REINIT|CONTROLLER_RESTORE)' -or
        $Line -match '^\[EVENT\] SENSOR:.*:(I2C_ERROR|CONFIG_ERROR|NOT_READY|UNKNOWN_PART)$' -or
        $Line -match '^\[OPTICAL\] FIFO_OVERFLOW') {
        ++$script:transportFaults
    }
}

$ports = @([System.IO.Ports.SerialPort]::GetPortNames())
if ($ports -notcontains $Port) {
    $shown = if ($ports.Count) { $ports -join ', ' } else { '<none>' }
    throw "Selected port $Port is not currently present. Available serial ports: $shown"
}

try {
    if ($OutputPath) {
        $fullPath = [System.IO.Path]::GetFullPath($OutputPath)
        if ([System.IO.File]::Exists($fullPath)) {
            throw "Output log already exists: $fullPath. Use a new filename to preserve old evidence."
        }
        $writer = New-Object System.IO.StreamWriter(
            $fullPath, $false, [System.Text.UTF8Encoding]::new($false))
        $writer.AutoFlush = $true
        Write-Host "Saving actual serial output to $fullPath" -ForegroundColor Cyan
    }

    $serial = New-Object System.IO.Ports.SerialPort $Port, 115200, 'None', 8, 'One'
    $serial.ReadTimeout = 250
    $serial.DtrEnable = $false
    $serial.RtsEnable = $false
    $serial.Open()

    Write-Host "Listening on $Port at 115200 baud for $Seconds seconds." -ForegroundColor Cyan
    Write-Host 'With BOOT released, tap EN/RESET once now.' -ForegroundColor Yellow
    if ($RequireTransportStable) {
        Write-Host 'Transport acceptance enabled: any observed I2C/sensor fault fails this run.' -ForegroundColor Yellow
    }

    $deadline = (Get-Date).AddSeconds($Seconds)
    $buffer = ''
    while ((Get-Date) -lt $deadline) {
        if ($serial.BytesToRead -gt 0) {
            $buffer += $serial.ReadExisting()
            while ($buffer.Contains("`n")) {
                $split = $buffer.Split(@("`n"), 2, [System.StringSplitOptions]::None)
                $line = $split[0].TrimEnd("`r")
                $buffer = $split[1]
                Accept-SerialLine -Line $line
            }
        }
        Start-Sleep -Milliseconds 50
    }

    if ($buffer.Length -gt 0) {
        Accept-SerialLine -Line $buffer.TrimEnd("`r", "`n")
    }
} finally {
    if ($serial -and $serial.IsOpen) { $serial.Close() }
    if ($writer) { $writer.Dispose() }
}

if (-not $script:markerSeen) {
    Write-Host "Expected physical boot marker was not observed: $ExpectedMarker" -ForegroundColor Red
    Write-Host 'Do not claim the verified v19 firmware is running on this ESP32.' -ForegroundColor Yellow
    exit 2
}

Write-Host "Verified physical boot marker: $ExpectedMarker" -ForegroundColor Green
Write-Host "Observed optical signal reports: $($script:opticalSamples); transport fault lines: $($script:transportFaults)" -ForegroundColor Cyan

if ($RequireTransportStable) {
    if (-not ($script:opticalReadySeen -and $script:mpuReadySeen)) {
        Write-Host 'FAIL: both optical and MPU sensor READY transitions were not observed.' -ForegroundColor Red
        exit 5
    }
    if ($script:transportFaults -gt 0) {
        Write-Host 'FAIL: physical I2C/sensor faults occurred. Inspect power, wiring and modules.' -ForegroundColor Red
        exit 4
    }
    Write-Host 'PASS: no transport faults OBSERVED during the selected capture interval.' -ForegroundColor Green
    Write-Host 'This is NOT medical BPM verification or BLE/SOS delivery acceptance.' -ForegroundColor Yellow
}

exit 0
