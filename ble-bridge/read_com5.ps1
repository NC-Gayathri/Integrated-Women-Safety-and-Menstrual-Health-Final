$p = New-Object System.IO.Ports.SerialPort 'COM5', 115200, 'None', 8, 'One'
$p.ReadTimeout = 4000
try {
    $p.Open()
    Write-Host "Connected to COM5 at 115200 baud. Reading lines..."
    for ($i = 0; $i -lt 10; $i++) {
        try {
            $line = $p.ReadLine()
            Write-Host "[ESP32 SERIAL] $line"
        } catch {
            Write-Host "Timeout waiting for line."
            break
        }
    }
} catch {
    Write-Host "Error opening COM5: $_"
} finally {
    if ($p.IsOpen) {
        $p.Close()
    }
}
