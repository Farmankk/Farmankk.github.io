@echo off
title Car4Rent Web Server (Port 3000)
cd /d "%~dp0"
echo ========================================================
echo   Car4Rent Server Start Ho Raha Hai...
echo   Live URL:  http://localhost:3000
echo   Admin URL: http://localhost:3000/admin.html
echo ========================================================
timeout /t 2 >nul
start http://localhost:3000
node server.js
pause
