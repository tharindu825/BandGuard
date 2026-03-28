@echo off
:: ============================================================
:: Stop_Server.bat - One-click Server Stopper
:: Kills the Node server process that runs in the background
:: ============================================================

:: 1. Check/Get Administrator Privileges
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin_stop.vbs"
    set params= %*
    echo UAC.ShellExecute "cmd.exe", "/c ""%~s0"" %params:"=""%", "", "runas", 1 >> "%temp%\getadmin_stop.vbs"
    "%temp%\getadmin_stop.vbs"
    del "%temp%\getadmin_stop.vbs"
    exit /B

:gotAdmin
    echo Stopping Internet Usage Tracker Server...

:: Try to kill the specific node.js server process gracefully first, then forcefully
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe' and CommandLine LIKE '%%server.js%%'\" | Select-Object -ExpandProperty ProcessId | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe' and CommandLine LIKE '%%start_server.bat%%'\" | Select-Object -ExpandProperty ProcessId | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo.
echo The Central Server has been stopped successfully.
echo You can close this window.
pause
