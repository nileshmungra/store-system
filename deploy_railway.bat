@echo off
echo ===================================================
echo     DEPLOYING TO RAILWAY - Bhumi-Store-App
echo ===================================================
echo.

echo [1/4] Checking prerequisites...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed. Please install Git first.
    pause
    exit /b 1
)

echo [2/4] Checking Railway CLI...
where railway >nul 2>&1
if %errorlevel% neq 0 (
    echo Railway CLI not found. Installing...
    npm install -g @railway/cli
)

echo.
echo [3/4] Initializing Railway project...
railway init --template express

echo.
echo [4/4] Deploying to Railway...
echo.
echo IMPORTANT: When prompted, select your GitHub repository.
echo After deployment, set these environment variables in Railway dashboard:
echo   - ADMIN_PASSWORD (your secure admin password)
echo   - API_SECRET_KEY (generate random string)
echo   - ALLOWED_ORIGINS (your domain or *)
echo.
echo MySQL database will be automatically provisioned.
echo.
railway up

echo.
echo ===================================================
echo     DEPLOYMENT COMPLETE!
echo     Your app URL: https://Bhumi-Store-App.up.railway.app
echo ===================================================
pause
