# Run the actual production PowerShell fault classifier against representative
# sensor-isolation traces without needing a Windows serial port or mock firmware.
$ErrorActionPreference = 'Stop'
$reader = Join-Path $PSScriptRoot '..\ble-bridge\read_com5.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path $reader).Path, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'The serial capture script contains a syntax error.' }
$functions = @($ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Test-RelevantTransportFault'
}, $true))
if ($functions.Count -ne 1) { throw 'Expected exactly one production sensor-fault classifier.' }
. ([scriptblock]::Create($functions[0].Extent.Text))

$cases = @(
    @('Both', '[I2C] Burst failed addr=0x68 reg=0x3B len=6 tx=4 rx=-1 SDA=1 SCL=1.', $true),
    @('Both', '[I2C] Read failed addr=0x57 reg=0x04 tx=4 rx=-1 SDA=1 SCL=1.', $true),
    @('Mpu',  '[I2C] Burst failed addr=0x68 reg=0x3B len=6 tx=4 rx=-1 SDA=1 SCL=1.', $true),
    @('Mpu',  '[I2C] Burst failed addr=0x69 reg=0x3B len=6 tx=0 rx=0 SDA=1 SCL=1.', $true),
    @('Mpu',  '[I2C] Read failed addr=0x57 reg=0x04 tx=4 rx=-1 SDA=1 SCL=1.', $false),
    @('Optical', '[I2C] Burst failed addr=0x68 reg=0x3B len=6 tx=4 rx=-1 SDA=1 SCL=1.', $false),
    @('Optical', '[I2C] Read failed addr=0x57 reg=0x04 tx=4 rx=-1 SDA=1 SCL=1.', $true),
    @('Mpu', '[EVENT] SENSOR:MAX3010X:NOT_READY', $false),
    @('Optical', '[EVENT] SENSOR:MPU:NOT_READY', $false),
    @('Mpu', '[EVENT] SENSOR:MPU6500:I2C_ERROR', $true),
    @('Optical', '[EVENT] SENSOR:MAX30102:I2C_ERROR', $true),
    @('Both', '[EVENT] SENSOR:MAX30102:I2C_ERROR', $true),
    @('Mpu', '[OPTICAL] FIFO_OVERFLOW: samples lost; resetting acquisition.', $false),
    @('Optical', '[OPTICAL] FIFO_OVERFLOW: samples lost; resetting acquisition.', $true),
    @('Mpu', '[BUS] SHARED_I2C_FAULT SDA=1 SCL=1 at=99.', $true),
    @('Optical', '[BUS] PERSISTENT_I2C_FAULT', $true),
    @('Both', '[I2C] unidentified failure', $true),
    @('Mpu', '[I2C] unidentified failure', $true),
    @('Optical', '[I2C] unidentified failure', $true),
    @('Mpu', '[MPU_SIGNAL] g=1.20 phase=IDLE failures=0', $false),
    @('Optical', '[PULSE_EVIDENCE] peaks=9 accepted=1', $false),
    @('Both', '[EVENT] SOS', $false)
)
foreach ($test in $cases) {
    $Sensor = [string]$test[0]
    $actual = [bool](Test-RelevantTransportFault -Line ([string]$test[1]))
    $expected = [bool]$test[2]
    if ($actual -ne $expected) {
        throw "Sensor=$Sensor expected=$expected actual=$actual for '$($test[1])'"
    }
}
Write-Host "NAARI serial fault isolation: $($cases.Count)/$($cases.Count) classification cases PASS."
