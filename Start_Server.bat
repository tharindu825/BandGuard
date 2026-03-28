@echo off
:: ============================================================
:: Start_Tracker_Server.bat - One-click Server Starter
:: Auto-elevates to Administrator, starts Node, opens Dashboard
:: ============================================================

:: 1. Check/Get Administrator Privileges
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    set params= %*
    echo UAC.ShellExecute "cmd.exe", "/c ""%~s0"" %params:"=""%", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    pushd "%cd%"
    cd /d "%~dp0"

:: 2. Start the Server hidden in the background
echo Starting Internet Usage Tracker Server in background...
cd server

:: Create a temporary VBScript to run start_server.bat completely hidden
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\run_hidden.vbs"
echo WshShell.Run "cmd /c start_server.bat", 0, False >> "%temp%\run_hidden.vbs"

:: Execute the hidden runner and clean up
cscript //nologo "%temp%\run_hidden.vbs"
del "%temp%\run_hidden.vbs"

:: 3. Wait a moment for server to bind to port 3000
echo Waiting for server initialization...
timeout /t 3 /nobreak > NUL

:: 4. Launch the Dashboard
echo Opening Dashboard...
start http://localhost:3000

exit
