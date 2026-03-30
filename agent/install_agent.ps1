#Requires -RunAsAdministrator
# ============================================================
# install_agent.ps1
# Run ONCE on each target PC to install the usage agent
# Usage: .\install_agent.ps1 -ServerURL "http://192.168.1.200:3000/api/usage"
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerURL
)

$TARGET      = "C:\NetAgent"
$SCRIPT_NAME = "agent.ps1"
$SCRIPT_DEST = "$TARGET\$SCRIPT_NAME"
$TASK_NAME   = "InternetUsageAgent"

Write-Host "=== Internet Usage Agent Installer ===" -ForegroundColor Cyan
Write-Host "Server URL : $ServerURL"
Write-Host "Install dir: $TARGET"
Write-Host ""

# 1. Create directory
New-Item -ItemType Directory -Force -Path $TARGET | Out-Null
Write-Host "[1/4] Created $TARGET" -ForegroundColor Green

# 2. Copy agent and patch SERVER_URL
$agentSource = Join-Path $PSScriptRoot $SCRIPT_NAME
if (-not (Test-Path $agentSource)) {
    Write-Error "agent.ps1 not found next to this installer at: $agentSource"
    exit 1
}
$content = Get-Content $agentSource -Raw -Encoding UTF8
$baseUrl = $ServerURL -replace '/api/usage.*', ''
$content  = $content -replace 'http://SERVER_IP:3000/api/usage', $ServerURL
$content  = $content -replace 'http://SERVER_IP:3000', $baseUrl
Set-Content -Path $SCRIPT_DEST -Value $content -Encoding UTF8
Write-Host "[2/4] Agent copied to $SCRIPT_DEST" -ForegroundColor Green

# 3. Remove old task if present
Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false -ErrorAction SilentlyContinue

# 4. Register Task Scheduler task (runs every 1 min as SYSTEM)
$action  = New-ScheduledTaskAction `
              -Execute "powershell.exe" `
              -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$SCRIPT_DEST`""

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
              -RepetitionInterval (New-TimeSpan -Minutes 1) `
              -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
              -MultipleInstances IgnoreNew `
              -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
              -StartWhenAvailable `
              -RunOnlyIfNetworkAvailable

$principal = New-ScheduledTaskPrincipal `
               -UserId "SYSTEM" `
               -LogonType ServiceAccount `
               -RunLevel Highest

Register-ScheduledTask `
    -TaskName  $TASK_NAME `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Host "[3/4] Scheduled task '$TASK_NAME' registered (every 1 min, SYSTEM)" -ForegroundColor Green

# 5. Start the task immediately
Start-ScheduledTask -TaskName $TASK_NAME
Write-Host "[4/4] Task started immediately" -ForegroundColor Green

Write-Host ""
Write-Host "=== Installation complete on $env:COMPUTERNAME ===" -ForegroundColor Cyan
Write-Host "Agent will report to: $ServerURL" -ForegroundColor Yellow
Write-Host "Error log          : $TARGET\errors.log"
