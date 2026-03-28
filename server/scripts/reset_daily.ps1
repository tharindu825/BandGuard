#Requires -RunAsAdministrator
# ============================================================
# reset_daily.ps1 — Midnight quota reset
# Runs at 00:01 every night via Task Scheduler as SYSTEM
# Registers itself in Task Scheduler on first run
# ============================================================

$API_BASE  = "http://localhost:3000"
$LOG_FILE  = "C:\NetAgent\reset.log"
$TASK_NAME = "UsageTrackerDailyReset"

function Write-Log([string]$msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
    Write-Host $line
}

Write-Log "=== Daily reset started ==="

# Call /api/reset which unblocks all devices via the server
try {
    $result = Invoke-RestMethod -Uri "$API_BASE/api/reset" `
                -Method POST -TimeoutSec 30 -ErrorAction Stop
    Write-Log "Reset API response: $($result | ConvertTo-Json -Compress)"
} catch {
    Write-Log "ERROR calling reset API: $_"
    Write-Log "Ensure the usage tracker server is running."
}

Write-Log "=== Daily reset complete ==="

# ── Self-register in Task Scheduler (run once to set up) ──
if (-not (Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue)) {
    Write-Log "Registering Task Scheduler task '$TASK_NAME'..."

    $action  = New-ScheduledTaskAction `
                  -Execute "powershell.exe" `
                  -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""

    $trigger  = New-ScheduledTaskTrigger -Daily -At "00:01"

    $settings = New-ScheduledTaskSettingsSet `
                  -StartWhenAvailable `
                  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

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

    Write-Log "Task '$TASK_NAME' registered — will run daily at 00:01"
}
