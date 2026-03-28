@echo off
:: ============================================================
:: install_agent.bat
:: One-click launcher for GPO/remote deployment.
:: Place this file alongside agent.ps1 and install_agent.ps1
:: Edit SERVER_URL below before deploying.
:: ============================================================

SET SERVER_URL=http://192.168.1.32:3000/api/usage

powershell.exe -NonInteractive -ExecutionPolicy Bypass ^
    -File "%~dp0install_agent.ps1" ^
    -ServerURL "%SERVER_URL%"

pause
