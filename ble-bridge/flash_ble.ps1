param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^COM\d+$')]
    [string]$Port,

    [ValidateRange(9600, 921600)]
    [int]$Baud = 115200,

    [ValidateRange(5, 60)]
    [int]$VerifySeconds = 20
)

$ErrorActionPreference = 'Stop'
$ExpectedMarker = '[FIRMWARE] shared-bus-diagnostic-v13-20261010'
$Fqbn = 'esp32:esp32:esp32doit-devkit-v1'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SketchDir = Join-Path $RepoRoot 'esp32-firmware\naari_kavach_dual_sensor_ble_test'
$SketchFile = Join-Path $SketchDir 'naari_kavach_dual_sensor_ble_test.ino'
$BuildDir = Join-Path $env:TEMP 'naari-kavach-dual-sensor-build'

function Resolve-ArduinoCli {
    $command = Get-Command arduino-cli.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'),
        (Join-Path $env:ProgramFiles 'Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    throw 'arduino-cli.exe was not found. Install Arduino IDE 2.x or Arduino CLI before using this verified flash helper.'
}

function Resolve-Esptool {
    $preferred = Join-Path $env:LOCALAPPDATA 'Arduino15\packages\esp32\tools\esptool_py\5.3.1\esptool.exe'
    if (Test-Path -LiteralPath $preferred) { return $preferred }

    $root = Join-Path $env:LOCALAPPDATA 'Arduino15\packages\esp32\tools\esptool_py'
    if (-not (Test-Path -LiteralPath $root)) {
        throw 'ESP32 esptool installation was not found under Arduino15. Install ESP32 Arduino core 3.3.12 first.'
    }
    $tools = @(Get-ChildItem -LiteralPath $root -Filter esptool.exe -File -Recurse)
    if ($tools.Count -ne 1) {
        throw "Expected exactly one usable esptool.exe fallback under $root; found $($tools.Count). Install/repair ESP32 core 3.3.12."
    }
    return $tools[0].FullName
}

function Assert-PortPresent {
    param([string]$Name)
    $ports = @([System.IO.Ports.SerialPort]::GetPortNames())
    if ($ports -notcontains $Name) {
        $shown = if ($ports.Count) { $ports -join ', ' } else { '<none>' }
        throw "Selected port $Name is not currently present. Available serial ports: $shown"
    }
}

function Assert-SourceMarker {
    param([string]$Path)
    $source = [System.IO.File]::ReadAllText($Path)
    if (-not $source.Contains($ExpectedMarker)) {
        throw "Local firmware source is stale or mismatched. Expected source marker: $ExpectedMarker. Run git checkout master and git pull origin master before flashing."
    }
}

function Assert-CompiledImageMarker {
    param([string]$Path)
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
    if (-not $ascii.Contains($ExpectedMarker)) {
        throw "Compiled merged image does not contain the required marker: $ExpectedMarker. NO FLASH WAS WRITTEN."
    }
    Write-Host "Compiled image marker verified: $ExpectedMarker" -ForegroundColor Green
}

function Verify-FlashedFirmwareMarker {
    param(
        [string]$Name,
        [int]$Seconds
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    $serial = $null
    $buffer = ''

    Write-Host "Opening a $Seconds-second physical boot verification window on $Name..." -ForegroundColor Cyan
    Write-Host 'Release BOOT now. Tap EN/RESET once while this window is open.' -ForegroundColor Yellow

    while ((Get-Date) -lt $deadline) {
        if ($null -eq $serial) {
            $ports = @([System.IO.Ports.SerialPort]::GetPortNames())
            if ($ports -notcontains $Name) {
                Start-Sleep -Milliseconds 100
                continue
            }

            try {
                $serial = New-Object System.IO.Ports.SerialPort $Name, 115200, 'None', 8, 'One'
                $serial.ReadTimeout = 250
                $serial.DtrEnable = $false
                $serial.RtsEnable = $false
                $serial.Open()
            } catch {
                if ($serial -and $serial.IsOpen) { $serial.Close() }
                $serial = $null
                Start-Sleep -Milliseconds 100
                continue
            }
        }

        try {
            if ($serial.BytesToRead -gt 0) {
                $buffer += $serial.ReadExisting()
                while ($buffer.Contains("`n")) {
                    $split = $buffer.Split(@("`n"), 2, [System.StringSplitOptions]::None)
                    $line = $split[0].TrimEnd("`r")
                    $buffer = $split[1]
                    Write-Host "[ESP32 SERIAL] $line"
                    if ($line -eq $ExpectedMarker) {
                        $serial.Close()
                        return $true
                    }
                }
            }
        } catch {
            if ($serial -and $serial.IsOpen) { $serial.Close() }
            $serial = $null
        }

        Start-Sleep -Milliseconds 50
    }

    if ($serial -and $serial.IsOpen) { $serial.Close() }
    return $false
}

Write-Host '=======================================================' -ForegroundColor Cyan
Write-Host ' NAARI KAVACH VERIFIED DUAL-SENSOR ESP32 FLASH' -ForegroundColor Cyan
Write-Host '=======================================================' -ForegroundColor Cyan
Write-Host "Target port: $Port" -ForegroundColor Yellow
Write-Host "Recovery baud: $Baud" -ForegroundColor Yellow
Write-Host "Required firmware marker: $ExpectedMarker" -ForegroundColor Yellow

Assert-PortPresent -Name $Port
$arduinoCli = Resolve-ArduinoCli
$esptool = Resolve-Esptool

if (-not (Test-Path -LiteralPath $SketchDir)) {
    throw "Verified dual-sensor sketch directory not found: $SketchDir"
}
if (-not (Test-Path -LiteralPath $SketchFile)) {
    throw "Verified dual-sensor sketch file not found: $SketchFile"
}
Assert-SourceMarker -Path $SketchFile

if (Test-Path -LiteralPath $BuildDir) {
    Remove-Item -LiteralPath $BuildDir -Recurse -Force
}
New-Item -ItemType Directory -Path $BuildDir | Out-Null

Write-Host ''
Write-Host '[1/4] Compiling the exact current dual-sensor sketch...' -ForegroundColor Cyan
& $arduinoCli compile --fqbn $Fqbn --output-dir $BuildDir $SketchDir
if ($LASTEXITCODE -ne 0) {
    throw "Arduino compile failed with exit code $LASTEXITCODE. No flash was attempted."
}

$mergedBin = Join-Path $BuildDir 'naari_kavach_dual_sensor_ble_test.ino.merged.bin'
if (-not (Test-Path -LiteralPath $mergedBin)) {
    throw "Compile completed but expected merged image was not produced: $mergedBin"
}
Assert-CompiledImageMarker -Path $mergedBin

Write-Host ''
Write-Host '[2/4] Enter ESP32 ROM download mode.' -ForegroundColor Cyan
Write-Host 'Close Serial Monitor/Plotter and other terminals using this board.' -ForegroundColor Yellow
Write-Host 'Hold BOOT, briefly press and release EN/RESET, then keep BOOT held.' -ForegroundColor Yellow
Read-Host 'Press Enter only after the board is in download mode' | Out-Null

Assert-PortPresent -Name $Port
Write-Host 'Running non-writing ROM-loader preflight (read-mac)...' -ForegroundColor Cyan
& $esptool --chip esp32 --port $Port --baud 115200 --before no-reset --after no-reset read-mac
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'ROM-loader preflight FAILED. NO FLASH WAS WRITTEN.' -ForegroundColor Red
    Write-Host 'Verify the selected port, USB data cable, direct USB connection, board power, BOOT/EN sequence, and temporarily isolate external wiring.' -ForegroundColor Yellow
    exit $LASTEXITCODE
}

Write-Host ''
Write-Host '[3/4] ROM-loader verified. Writing the exact marker-verified merged image...' -ForegroundColor Cyan
& $esptool --chip esp32 --port $Port --baud $Baud --before no-reset --after hard-reset write-flash 0x0 $mergedBin
if ($LASTEXITCODE -ne 0) {
    throw "Flash write failed with exit code $LASTEXITCODE. Do not claim physical acceptance."
}

Write-Host ''
Write-Host '[4/4] Verifying the firmware that actually boots on the physical ESP32...' -ForegroundColor Cyan
if (-not (Verify-FlashedFirmwareMarker -Name $Port -Seconds $VerifySeconds)) {
    Write-Host '' -ForegroundColor Red
    Write-Host "FLASH WRITE COMPLETED, BUT PHYSICAL BOOT IDENTITY FAILED." -ForegroundColor Red
    Write-Host "Required marker was not observed: $ExpectedMarker" -ForegroundColor Red
    Write-Host 'Do not continue sensor acceptance. Release BOOT, tap EN/RESET, verify the selected COM port, and rerun this helper.' -ForegroundColor Yellow
    exit 3
}

Write-Host ''
Write-Host '=======================================================' -ForegroundColor Green
Write-Host ' FLASH + PHYSICAL BOOT IDENTITY VERIFIED' -ForegroundColor Green
Write-Host '=======================================================' -ForegroundColor Green
Write-Host $ExpectedMarker -ForegroundColor Green
Write-Host 'The correct firmware is now proven to have booted. Continue with the five-minute sensor/BLE/SOS acceptance run.' -ForegroundColor Yellow
