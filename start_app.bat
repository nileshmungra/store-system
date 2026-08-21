@echo off
cd /d "%~dp0"

title Store System Auto Starter
color 0A

echo ===================================================
echo Store Inventory System - Auto Starter
echo ===================================================
echo.

echo Checking MySQL Database Status on Port 3306...
netstat -ano | findstr ":3306" >nul 2>&1
if %errorlevel% neq 0 (
    echo MySQL Server is NOT running! Auto-starting XAMPP MySQL...
    if exist "C:\xampp\mysql_start.bat" (
        start /b C:\xampp\mysql_start.bat >nul 2>&1
    ) else if exist "C:\xampp\mysql\bin\mysqld.exe" (
        start /b C:\xampp\mysql\bin\mysqld.exe >nul 2>&1
    )
    timeout /t 3 >nul
) else (
    echo MySQL Server is already running on port 3306.
)

echo.
echo Starting Application...
echo.

python start_tunnels.py

if %errorlevel% neq 0 (
    echo.
    echo Python Execution Error Detected!
    echo.
)

echo.
echo ===================================================
echo Press any key to close this window...
echo ===================================================
pause