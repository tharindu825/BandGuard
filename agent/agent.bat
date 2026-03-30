@echo off
echo [NetAgent] Installing BandGuard Agent...

:: ── Set real server IP here ──
set SERVER_IP=192.168.1.32

:: ── Create directory and copy agent file ──
mkdir "C:\NetAgent" 2>nul
copy "%~dp0agent.ps1" "C:\NetAgent\agent.ps1" /Y >nul

:: ── Update server IP inside agent.ps1 ──
powershell -ExecutionPolicy Bypass -Command "$content = Get-Content 'C:\NetAgent\agent.ps1'; $content = $content -replace 'http://SERVER_IP:3000', ('http://' + '%SERVER_IP%' + ':3000'); Set-Content 'C:\NetAgent\agent.ps1' -Value $content"

:: ── Remove any existing task ──
schtasks /delete /tn "NetTrackerAgent" /f >nul 2>&1
schtasks /delete /tn "InternetUsageAgent" /f >nul 2>&1

:: ── Create scheduled task as SYSTEM with highest privileges ──
powershell -ExecutionPolicy Bypass -Command "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File \"C:\NetAgent\agent.ps1\"'; $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1); $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1); $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest; Register-ScheduledTask -TaskName 'NetTrackerAgent' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'BandGuard Internet Usage Agent' -Force; Write-Host 'Task registered as SYSTEM'"

:: ── Start the task immediately ──
schtasks /run /tn "NetTrackerAgent" >nul 2>&1

echo.
echo [NetAgent] Done! Verifying...

:: ── Verify task user ──
powershell -ExecutionPolicy Bypass -Command "Get-ScheduledTask -TaskName 'NetTrackerAgent' | ForEach-Object { Write-Host ('RunAs : ' + $_.Principal.UserId); Write-Host ('Level : ' + $_.Principal.RunLevel); Write-Host ('State : ' + $_.State) }"

echo.
echo [NetAgent] Installation complete.
pause
