@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Store System - LOCAL NETWORK HTTPS SERVER
color 0B

echo ===================================================
echo  Store System - Local Network Server Starter (HTTPS)
echo ===================================================
echo.

:: ===================================================
:: STEP 1 - CHECK PYTHON VIRTUAL ENVIRONMENT
:: ===================================================
echo [1/6] Checking Python Virtual Environment...
echo.

if not exist "%~dp0venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment not found!
    echo.
    echo Expected location:
    echo %~dp0venv\Scripts\python.exe
    echo.
    echo Please create/setup the venv first.
    echo.
    pause
    exit /b 1
)

echo [OK] Virtual environment found.
echo.

:: ===================================================
:: STEP 2 - CHECK SSL CERTIFICATES
:: ===================================================
echo [2/6] Checking SSL Certificates...
echo.

if not exist "%~dp0key.pem" (
    echo [ERROR] key.pem not found!
    echo.
    echo Expected:
    echo %~dp0key.pem
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0cert.pem" (
    echo [ERROR] cert.pem not found!
    echo.
    echo Expected:
    echo %~dp0cert.pem
    echo.
    pause
    exit /b 1
)

echo [OK] SSL certificates found.
echo.

:: ===================================================
:: STEP 3 - CHECK MYSQL PORT 3307
:: ===================================================
echo [3/6] Checking MySQL Database Status on Port 3307...
echo.

netstat -ano | findstr /R /C:":3307 .*LISTENING" >nul 2>&1

if %errorlevel% neq 0 (

    echo MySQL Server is NOT running on port 3307.
    echo Attempting to start XAMPP MySQL...
    echo.

    if exist "C:\xampp\mysql_start.bat" (

        echo Starting C:\xampp\mysql_start.bat...
        start "" /b "C:\xampp\mysql_start.bat"

    ) else if exist "C:\xampp\mysql\bin\mysqld.exe" (

        echo Starting XAMPP mysqld.exe...
        start "" /b "C:\xampp\mysql\bin\mysqld.exe"

    ) else (

        echo.
        echo [ERROR] XAMPP MySQL executable not found!
        echo.
        echo Please check your XAMPP installation.
        echo.
        pause
        exit /b 1
    )

    echo.
    echo Waiting for MySQL to start...

    set "mysql_ready=0"

    for /L %%i in (1,1,10) do (

        timeout /t 1 >nul

        netstat -ano | findstr /R /C:":3307 .*LISTENING" >nul 2>&1

        if not errorlevel 1 (
            set "mysql_ready=1"
            goto MYSQL_STARTED
        )

        echo   Waiting... %%i/10
    )

    if "%mysql_ready%"=="0" (
        echo.
        echo [ERROR] MySQL could not be detected on port 3307.
        echo.
        echo Please open XAMPP and check MySQL.
        echo.
        pause
        exit /b 1
    )

) else (

    echo [OK] MySQL Server is already running on port 3307.
)

:MYSQL_STARTED

echo [OK] MySQL is ready.
echo.

:: ===================================================
:: STEP 4 - CHECK FASTAPI PORT
:: ===================================================
echo [4/6] Checking FastAPI Port 8000...
echo.

netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul 2>&1

if not errorlevel 1 (

    echo [WARNING] Port 8000 is already in use.
    echo.
    echo A FastAPI/other server may already be running.
    echo.
    goto FIND_WIFI_IP
)

echo [OK] Port 8000 is available.
echo.

:: ===================================================
:: STEP 5 - START FASTAPI SERVER
:: ===================================================
echo [5/6] Starting FastAPI Server with HTTPS...
echo.

start "Store System - FastAPI Server" /b "%~dp0venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --no-access-log --ssl-keyfile "%~dp0key.pem" --ssl-certfile "%~dp0cert.pem" --log-level warning

echo Waiting for FastAPI to start...
echo.

timeout /t 4 >nul

:: ===================================================
:: VERIFY FASTAPI
:: ===================================================
netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul 2>&1

if errorlevel 1 (

    echo.
    echo ===================================================
    echo   [ERROR] FASTAPI SERVER FAILED TO START!
    echo ===================================================
    echo.
    echo Please run this command manually:
    echo.
    echo venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
    echo.
    echo This will show the actual error.
    echo.
    pause
    exit /b 1
)

echo [OK] FastAPI Server is running on port 8000.
echo.

:FIND_WIFI_IP

:: ===================================================
:: STEP 6 - FIND WI-FI IP ADDRESS
:: ===================================================
echo [6/6] Finding Wi-Fi Network IP Address...
echo.

set "local_ip="

for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-NetIPAddress -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -notlike '169.254.*'} | Select-Object -First 1 -ExpandProperty IPAddress)"`) do (
    set "local_ip=%%A"
)

if not defined local_ip (

    echo [ERROR] Could not detect Wi-Fi IPv4 address.
    echo.
    echo Please run:
    echo ipconfig
    echo.
    echo and check your Wi-Fi adapter.
    echo.
    pause
    exit /b 1
)

:: ===================================================
:: FINAL SERVER INFORMATION
:: ===================================================

echo.
echo =================================================================
echo.
echo              INVENTORY SYSTEM SERVER IS LIVE!
echo.
echo =================================================================
echo.
echo   Local PC:
echo   https://localhost:8000
echo.
echo   Wi-Fi Network:
echo   https://%local_ip%:8000
echo.
echo   Open the Wi-Fi Network URL on:
echo   - Mobile
echo   - Other PC
echo   - Tablet
echo.
echo   IMPORTANT:
echo   Mobile/PC must be connected to the SAME Wi-Fi network.
echo.
echo =================================================================
echo.
echo   MySQL  : PORT 3307
echo   FastAPI: PORT 8000
echo   HTTPS  : ENABLED
echo   Wi-Fi IP: %local_ip%
echo =================================================================
echo.

pause