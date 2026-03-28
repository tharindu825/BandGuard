@echo off
:: ============================================================
:: Stop_Agent.bat
:: Fully stops the Internet Usage Agent background process
:: ============================================================
title Stopping Agent

:: 1. Request Administrator Privileges (needed to stop SYSTEM tasks)
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin_agent.vbs"
    set params= %*
    echo UAC.ShellExecute "cmd.exe", "/c ""%~s0"" %params:"=""%", "", "runas", 1 >> "%temp%\getadmin_agent.vbs"
    "%temp%\getadmin_agent.vbs"
    del "%temp%\getadmin_agent.vbs"
    exit /B

:gotAdmin
    echo ==============================================
    echo        STOPPING INTERNET USAGE AGENT
    echo ==============================================
    echo.
    
    echo Stopping the Windows Scheduled Task...
    powershell -Command "Stop-ScheduledTask -TaskName 'InternetUsageAgent' -ErrorAction SilentlyContinue"
    
    echo Terminating the background PowerShell process...
    :: Target ONLY the agent's powershell process, do not kill other powershell windows!
    powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe' and CommandLine LIKE '%%agent.ps1%%'\" | Where-Object CommandLine -notmatch 'Get-CimInstance' | Select-Object -ExpandProperty ProcessId | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
    
    echo.
    echo The agent has been successfully stopped.
    echo (Note: You can restart it anytime by running install_agent.bat again)
    echo.
    pause
