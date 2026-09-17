@echo off
echo ===================================================
echo     DEPLOYING CHANGES TO RENDER (LIVE PRODUCTION)
echo ===================================================
echo.

:: User pase thi commit message levo
set /p commit_msg="Enter description of your changes (Commit Message): "

if "%commit_msg%"=="" (
    set commit_msg="Updated application features"
)

echo.
echo [1/3] Adding files to Git...
git add .

echo.
echo [2/3] Committing changes...
git commit -m "%commit_msg%"

echo.
echo [3/3] Pushing code to GitHub...
git push origin main

echo.
echo ===================================================
echo     SUCCESS! Code pushed to GitHub.
echo     Render will automatically start building your app.
echo ===================================================
pause