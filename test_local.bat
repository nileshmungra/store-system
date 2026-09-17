@echo off
echo ===================================================
echo     STARTING FASTAPI LOCAL TESTING SERVER
echo ===================================================

:: MySQL Local Service સેટઅપ
set MYSQL_HOST=127.0.0.1
set MYSQL_PORT=3307
set MYSQL_USER=root
set MYSQL_PASSWORD=
set MYSQL_DATABASE=inventory_db

echo.
echo [1/2] Local Virtual Environment check karine uvicorn run kariye chhiye...
echo.

:: Python Virtual Environment Activate karo ane Server chalu karo
call .venv\Scripts\activate.bat
uvicorn main:app --reload --host 127.0.0.1 --port 8000

pause