@echo off
title Naari Kavach - BLE to HTTP IoT Gateway Bridge
echo ==============================================================================
echo   NAARI KAVACH - BLE TO HTTP IOT GATEWAY BRIDGE
echo ==============================================================================
echo.
echo Checking Python environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH! Please install Python 3.10+.
    pause
    exit /b 1
)

echo Installing / verifying dependencies...
python -m pip install -r requirements.txt --quiet

echo.
echo Starting BLE Bridge...
python ble_bridge.py
pause
