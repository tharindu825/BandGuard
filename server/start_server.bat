@echo off
:: ============================================================
:: start_server.bat — Start the Usage Tracker Node.js server
:: Run as Administrator on the central server PC
:: ============================================================
title Internet Usage Tracker Server

echo.
echo  ██╗   ██╗███████╗ █████╗  ██████╗ ███████╗
echo  ██║   ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝
echo  ██║   ██║███████╗███████║██║  ███╗█████╗  
echo  ██║   ██║╚════██║██╔══██║██║   ██║██╔══╝  
echo  ╚██████╔╝███████║██║  ██║╚██████╔╝███████╗
echo   ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
echo  Internet Usage Tracker - Server
echo.

cd /d "%~dp0"

if not exist node_modules (
    echo [SETUP] Running npm install...
    npm install
    echo.
)

echo [START] Starting server on port 3000...
echo [INFO]  Dashboard: http://localhost:3000
echo [INFO]  Press Ctrl+C to stop
echo.
node server.js
pause
