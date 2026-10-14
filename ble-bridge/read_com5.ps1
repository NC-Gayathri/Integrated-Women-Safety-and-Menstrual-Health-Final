param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^COM\d+$')]
    [string]$Port,

    [ValidateRange(3, 900)]
    [int]$Seconds = 15,

    [string]$OutputPath,

    [switch]$RequireTransportStable,

    [ValidateSet('Both', 'Optical', 'Mpu')]
    [string]$Sensor = 'Both',

    [switch]$RequireMeasuredHeartbeat,
    [switch]$RequireFallEvent
)

$ErrorActionPreference = 'Stop'
$ExpectedMarker = '[EVIDENCE_POLICY] pulse-and-fall-diags-v22-20261014'
$serial = $null
$writer = $null
$script:markerSeen = $false
$script:bootMarkerCount = 0
$script:observationUntil = $null
$script:opticalReadySeen = $false
$script:mpuReadySeen = $false
$script:transportFaults = 0
$script:opticalSamples = 0
$script:mpuSamples = 0
$script:heartRatesObserved = 0
$script:fallEventsObserved = 0
$script:latestPulseEvidence = ''

if ($Sensor -eq 'Mpu' -and $RequireMeasuredHeartbeat) {
    throw 'Heartbeat cannot be required during MPU-only isolation.'
}
if ($Sensor -eq 'Optical' -and $RequireFallEvent) {
    throw 'Fall detection cannot be required during optical-only isolation.'
}

# Evaluate only selected-device faults. Unknown-address/controller errors
# fail closed, because they cannot safely be attributed to an unused sensor.
function Test-RelevantTransportFault {
    param([string]$Line)
    if ($Line -match '^\[BUS\] (SHARED_I2C_FAULT|PERSISTENT_I2C_FAULT|LINE_HELD_LOW|CONTROLLER_REINIT|CONTROLLER_RESTORE)') { return $true }
    if ($Line -match '^\[I2C\]') {
        if ($Sensor -eq 'Both') { return $true }
        if ($Line -match 'addr=0x([0-9A-Fa-f]{2})') {
            $address = [Convert]::ToInt32($Matches[1], 16)
            if ($Sensor -eq 'Mpu') { return ($address -eq 0x68 -or $address -eq 0x69) }
            return ($address -eq 0x57)
        }
        return $true
    }
    if ($Line -match '^\[EVENT\] SENSOR:([^:]+):(I2C_ERROR|CONFIG_ERROR|NOT_READY|UNKNOWN_PART)$') {
        $device = $Matches[1]
        if ($Sensor -eq 'Both') { return $true }
        if ($Sensor -eq 'Mpu') { return $device.StartsWith('MPU') }
        return $device.StartsWith('MAX')
    }
    if ($Line -match '^\[OPTICAL\] FIFO_OVERFLOW') { return ($Sensor -ne 'Mpu') }
    return $false
}

# Serial lines, not build output, provide independent evidence of what booted.
function Accept-SerialLine {
    param([string]$Line)
    Write-Host "[ESP32 SERIAL] $Line"
    if ($null -ne $script:writer) { $script:writer.WriteLine($Line) }
    if ($Line -eq $ExpectedMarker) {
        ++$script:bootMarkerCount
        if ($script:bootMarkerCount -eq 1) {
            # Measure the ENTIRE requested duration only after real v22 boot.
            $script:markerSeen = $true
            $script:observationUntil = (Get-Date).AddSeconds($Seconds)
            Write-Host "v22 boot detected; now recording a full $Seconds-second interval." -ForegroundColor Cyan
        } else {
            # An unsolicited new setup banner invalidates a stability run.
            ++$script:transportFaults
            Write-Host 'Additional firmware boot detected; possible ESP32 reset.' -ForegroundColor Red
        }
    }
    if ($Line -match '^\[EVENT\] SENSOR:MAX3010[02]:READY$') {
        $script:opticalReadySeen = $true
    }
    if ($Line -match '^\[EVENT\] SENSOR:MPU(6050|6500):READY$') {
        $script:mpuReadySeen = $true
    }
    if ($Line -match '^\[SIGNAL\] samples=') { ++$script:opticalSamples }
    if ($Line -match '^\[MPU_SIGNAL\] g=') { ++$script:mpuSamples }
    if ($Line -match '^\[PULSE_EVIDENCE\]') { $script:latestPulseEvidence = $Line }
    if ($Line -match '^\[EVENT\] HEART_RATE:([0-9]{2,3})$') {
        $bpm = [int]$Matches[1]
        if ($bpm -ge 30 -and $bpm -le 200) { ++$script:heartRatesObserved }
    }
    if ($Line -eq '[EVENT] FALL_DETECTED') { ++$script:fallEventsObserved }
    if (Test-RelevantTransportFault -Line $Line) { ++$script:transportFaults }
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
        $writer = [System.IO.StreamWriter]::new(
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

    $bootDeadline = (Get-Date).AddSeconds(45)
    $buffer = ''
    while ($true) {
        if (-not $script:markerSeen -and (Get-Date) -ge $bootDeadline) { break }
        if ($script:markerSeen -and (Get-Date) -ge $script:observationUntil) { break }
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
    Write-Host 'Do not claim the verified v22 firmware is running on this ESP32.' -ForegroundColor Yellow
    exit 2
}

Write-Host "Verified physical boot marker: $ExpectedMarker" -ForegroundColor Green
Write-Host "Sensor scope: $Sensor; optical signal lines: $($script:opticalSamples); MPU sample lines: $($script:mpuSamples)" -ForegroundColor Cyan
Write-Host "Relevant fault lines: $($script:transportFaults); numeric HR events: $($script:heartRatesObserved); confirmed fall events: $($script:fallEventsObserved)" -ForegroundColor Cyan
if ($script:latestPulseEvidence) { Write-Host "Last pulse evidence: $($script:latestPulseEvidence)" -ForegroundColor Cyan }

if ($RequireTransportStable) {
    $needOptical = $Sensor -ne 'Mpu'
    $needMpu = $Sensor -ne 'Optical'
    if (($needOptical -and (-not $script:opticalReadySeen -or $script:opticalSamples -eq 0)) -or
        ($needMpu -and (-not $script:mpuReadySeen -or $script:mpuSamples -eq 0))) {
        Write-Host 'FAIL: selected sensor did not show both READY and live sample evidence.' -ForegroundColor Red
        Write-Host 'During an optical test, place a finger still to produce a [SIGNAL] line.' -ForegroundColor Yellow
        exit 5
    }
    if ($script:transportFaults -gt 0) {
        Write-Host 'FAIL: observed selected-sensor or shared-bus faults. Inspect hardware.' -ForegroundColor Red
        exit 4
    }
    Write-Host 'PASS: selected sensor(s) showed samples with no observed transport faults.' -ForegroundColor Green
}
if ($RequireMeasuredHeartbeat -and $script:heartRatesObserved -eq 0) {
    Write-Host 'FAIL: no measured HEART_RATE event; finger detection is not BPM.' -ForegroundColor Red
    exit 6
}
if ($RequireFallEvent -and $script:fallEventsObserved -eq 0) {
    Write-Host 'FAIL: no confirmed FALL_DETECTED; LOW_G_ENTER is insufficient.' -ForegroundColor Red
    exit 7
}
Write-Host 'Not a medical BPM validation, clinical fall test or phone alert delivery certification.' -ForegroundColor Yellow
exit 0
