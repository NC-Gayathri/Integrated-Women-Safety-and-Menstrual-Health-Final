Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }

Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

[Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType=WindowsRuntime] | Out-Null

$op = [Windows.Devices.Radios.Radio]::RequestAccessAsync()
$access = Await $op ([Windows.Devices.Radios.RadioAccessStatus])
Write-Host "Radio Access Status: $access"

$op = [Windows.Devices.Radios.Radio]::GetRadiosAsync()
$radios = Await $op ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])

foreach ($r in $radios) {
    Write-Host "Radio Name: $($r.Name) | Kind: $($r.Kind) | State: $($r.State)"
    if ($r.Kind -eq [Windows.Devices.Radios.RadioKind]::Bluetooth -and $r.State -ne [Windows.Devices.Radios.RadioState]::On) {
        Write-Host "Attempting to turn ON Bluetooth radio..."
        $setOp = $r.SetStateAsync([Windows.Devices.Radios.RadioState]::On)
        $res = Await $setOp ([Windows.Devices.Radios.RadioAccessStatus])
        Write-Host "SetStateAsync Result: $res"
        Write-Host "New Radio State: $($r.State)"
    }
}
