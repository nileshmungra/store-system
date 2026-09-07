@echo off
setlocal EnableExtensions
cd /d "%~dp0"

:MENU
cls
echo ===================================================
echo   Store System - Testing & Deployment Menu
echo ===================================================
echo.
echo  [1] Localhost Testing (HTTPS, port 8000)
echo  [2] Tunnel Testing (Cloudflare quick tunnel)
echo  [3] Live on Railway (git push + railway up)
echo  [4] Exit
echo.
set /p "choice=Enter your choice (1-4): "

if "%choice%"=="1" goto LOCALHOST
if "%choice%"=="2" goto TUNNEL
if "%choice%"=="3" goto RAILWAY
if "%choice%"=="4" goto EXIT
goto MENU

:: ===================================================
:: OPTION 1: Localhost Testing
:: ===================================================
:LOCALHOST
cls
echo ===================================================
echo  Localhost Testing (HTTPS, port 8000)
echo ===================================================

:: Check venv
if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found!
    echo Please create it first: python -m venv venv
    pause
    goto MENU
)

:: Check SSL certs
if not exist "key.pem" (
    echo [ERROR] key.pem not found!
    pause
    goto MENU
)
if not exist "cert.pem" (
    echo [ERROR] cert.pem not found!
    pause
    goto MENU
)

:: Check MySQL
netstat -ano | findstr /R /C:":3307 .*LISTENING" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] MySQL not running on port 3307. Attempting auto-start...
    if exist "C:\xia\mysql_start.bat" (
        start "" /b "C:\xia\mysql_start.bat"
        timeout /t 5 >nul
    )
)

:: Start server
echo [INFO] Starting FastAPI server on https://localhost:8000 ...
start "Store System - Localhost" /b venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --no-access-log --ssl-keyfile key.pem --ssl-certfile cert.pem --log-level warning

timeout /t 4 >nul

:: Verify
netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Server failed to start!
    echo Run manually: venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
    pause
    goto MENU
)

echo [SUCCESS] Server running on https://localhost:8000
echo.
echo   Dashboard: https://localhost:8000/
echo   Scanner:   https://localhost:8000/scanner
echo   Dispatch:  https://localhost:8000/dispatch-page
echo   Challan:   https://localhost:8000/challan-page
echo.
echo   Mobile: connect to laptop hotspot, use https://172.20.235.123:8000
echo.
pause
goto MENU

:: ===================================================
:: OPTION 2: Tunnel Testing (Cloudflare)
:: ===================================================
:TUNNEL
cls
echo ===================================================
echo  Tunnel Testing (Cloudflare quick tunnel)
echo ===================================================

:: Check venv
if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found!
    pause
    goto MENU
)

:: Check cloudflared
if not exist "cloudflared.exe" (
    echo [WARNING] cloudflared.exe not found in project folder!
    echo Tunnel will fallback to local network IP.
    echo.
)

echo [INFO] Starting Cloudflare tunnel...
echo        This provides a real HTTPS certificate for mobile camera access.
echo.
start "Store System - Tunnel" /b venv\Scripts\python.exe start_tunnels.py

timeout /t 10 >nul

:: Check if LATEST_LIVE_LINK.txt was updated
if exist "LATEST_LIVE_LINK.txt" (
    echo [INFO] Live links:
    type "LATEST_LIVE_LINK.txt"
) else (
    echo [INFO] Waiting for tunnel to establish...
)

echo.
echo   Open the Scanner URL on your mobile (connected to laptop hotspot):
echo   https://YOUR_SUBDOMAIN.trycloudflare.com/scanner
echo.
pause
goto MENU

:: ===================================================
:: OPTION 3: Live on Railway
:: ===================================================
:RAILWAY
cls
echo ===================================================
echo  Live on Railway (git push + railway up)
echo ===================================================

:: Check git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH!
    pause
    goto MENU
)

:: Check railway CLI
railway --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Railway CLI not found!
    echo Install: npm install -g @railway/cli
    echo Then login: railway login
    pause
    goto MENU
)

:: Step 1: Show current status
echo.
echo [1/5] Current git status:
git status --short

:: Step 2: Stage all changes
echo.
echo [2/5] Staging all changes...
git add . 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git add failed!
    pause
    goto MENU
)

:: Step 3: Commit
echo.
echo [3/5] Committing changes...
for %%a in ("") do set "commit_msg=Auto-deploy: %date% %time%"
git commit -m "%commit_msg%" 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Nothing to commit or commit failed.
    goto RAILWAY_DEPLOY
)

:: Step 4: Push
:RAILWAY_DEPLOY
echo.
echo [4/5] Pushing to remote...
git push origin main 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Push failed. Trying force push...
    git push origin main --force-with-lease 2>&1
)

:: Step 5: Deploy on Railway
echo.
echo [5/5] Deploying on Railway...
railway up 2>&1

:: Verify
echo.
echo [SUCCESS] Railway deployment triggered!
echo.
echo   Check status: railway status
echo   View logs: railway logs --tail
echo   Open app: railway open
echo.
pause
goto MENU

:: ===================================================
:: EXIT
:: ===================================================
:EXIT
cls
echo Goodbye!
exit /b 0