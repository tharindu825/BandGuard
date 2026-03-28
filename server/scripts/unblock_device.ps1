# ============================================================
# unblock_device.ps1 — Restore internet access for a device
# Reverses all three layers applied by block_device.ps1
# CONFIGURE: Match $LAN_INTERFACE to your LAN adapter name
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceIP
)

$LAN_INTERFACE = "Ethernet"      # <-- Must match block_device.ps1
$LOG_FILE      = "C:\NetAgent\server_block.log"

function Write-Log([string]$msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [UNBLOCK] $msg"
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
    Write-Host $line
}

Write-Log "Unblocking $DeviceIP ..."

# ── Remove RRAS IP Packet Filters ─────────────────────────
try {
    $r1 = netsh routing ip delete filter `
        name="$LAN_INTERFACE" filtertype=INPUT `
        srcaddr=$DeviceIP srcmask=255.255.255.255 `
        dstaddr=0.0.0.0 dstmask=0.0.0.0 proto=ANY 2>&1
    Write-Log "RRAS INPUT filter removed: $r1"

    $r2 = netsh routing ip delete filter `
        name="$LAN_INTERFACE" filtertype=OUTPUT `
        dstaddr=$DeviceIP dstmask=255.255.255.255 `
        srcaddr=0.0.0.0 srcmask=0.0.0.0 proto=ANY 2>&1
    Write-Log "RRAS OUTPUT filter removed: $r2"
} catch {
    Write-Log "RRAS delete failed (may not have existed): $_"
}

# ── Remove Windows Firewall rules ─────────────────────────
Remove-NetFirewallRule -DisplayName "UsageBlock_OUT_$DeviceIP" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "UsageBlock_IN_$DeviceIP"  -ErrorAction SilentlyContinue
Write-Log "Firewall rules removed"

# ── Remove null host route ────────────────────────────────
try {
    $r3 = route DELETE $DeviceIP MASK 255.255.255.255 127.0.0.1 2>&1
    Write-Log "Null route removed: $r3"
} catch {
    Write-Log "Null route delete failed (may not have existed): $_"
}

Write-Log "Unblock complete for $DeviceIP"
