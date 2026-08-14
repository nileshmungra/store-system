@echo off
cd /d "%~dp0"

title Store System - LOCAL NETWORK HTTPS SERVER
color 0B

echo ===================================================
echo  Store System - Local Network Server Starter (HTTPS)
echo ===================================================
echo.

echo Checking MySQL Database Status on Port 3307...
netstat -ano | findstr ":3307" >nul 2>&1
if %errorlevel% neq 0 (
    echo  MySQL Server is NOT running! Auto-starting XAMPP MySQL...
    if exist "C:\xampp\mysql_start.bat" (
        start /b C:\xampp\mysql_start.bat >nul 2>&1
    ) else if exist "C:\xampp\mysql\bin\mysqld.exe" (
        start /b C:\xampp\mysql\bin\mysqld.exe >nul 2>&1
    )
    timeout /t 3 >nul
) else (
    echo  MySQL Server is already running on port 3307.
)

echo.
echo Starting FastAPI Server with SSL Certificates...
:: 🔽 અહીં SSL ફાઈલો ઉમેરી છે જેથી કેમેરા પરમિશન મળે
start "FastAPI Server" /b python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000 --no-access-log --ssl-keyfile key.pem --ssl-certfile cert.pem

echo.
echo  Finding your Local IP Address...
timeout /t 3 >nul

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| find "IPv4"') do (
    for /f "tokens=*" %%b in ("%%a") do set local_ip=%%b
)

echo.
echo =================================================================
echo    SERVER IS LIVE ON YOUR LOCAL NETWORK!
echo.
echo  Please Open below Link in your Mobile and PC:
:: 🔽 અહીં HTTP ની જગ્યાએ HTTPS કર્યું છે
echo  https://%local_ip%:8000
echo =================================================================
echo.

pause