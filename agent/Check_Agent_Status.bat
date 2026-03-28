@echo off
:: ============================================================
:: Check_Agent_Status.bat
:: Easily check if your Internet Usage Agent is running
:: ============================================================
title Internet Usage Agent Status
color 0B

echo ==============================================
echo        INTERNET USAGE AGENT STATUS
echo ==============================================
echo.

:: 1. Check Task Scheduler Registration
echo [1/3] Checking Windows Task Scheduler...
powershell -Command "Get-ScheduledTask -TaskName 'InternetUsageAgent' -ErrorAction SilentlyContinue | Select-Object TaskName, State | Format-Table -AutoSize"

:: 2. Check if the Process is currently active in memory
echo [2/3] Checking Running Background Processes...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe' and CommandLine LIKE '%%agent.ps1%%'\" | Where-Object CommandLine -notmatch 'Get-CimInstance' | Select-Object ProcessId, CommandLine | Format-List"

:: 3. Show recent errors if any exist
echo [3/3] Checking Recent Agent Errors (C:\NetAgent\errors.log)...
if exist "C:\NetAgent\errors.log" (
    echo/
    powershell -NoProfile -Command "Get-Content C:\NetAgent\errors.log -Tail 5"
) else (
    echo   No error log found ^(This is a good sign!^).
)

echo.
echo ==============================================
echo Press any key to close this window.
pause > NUL
