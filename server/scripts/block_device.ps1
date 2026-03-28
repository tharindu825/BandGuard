# ============================================================
# block_device.ps1 — Block internet access for a specific IP
# Runs on the central server (Windows 11 acting as gateway)
#
# Prerequisites:
#   1. This server PC must be the default gateway for clients
#   2. IP Routing must be enabled:
#      Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" `
#          -Name "IPEnableRouter" -Value 1
#   3. RRAS must be installed & running:
#      Install-RemoteAccess -VpnType RoutingOnly
#
# CONFIGURE: Set $LAN_INTERFACE to match your LAN adapter name
#   Run: Get-NetAdapter | Select Name to find it
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceIP
)

# ── CONFIGURE THIS ─────────────────────────────────────────
$LAN_INTERFACE = "Ethernet"      # <-- Your LAN NIC name (Get-NetAdapter)
$LOG_FILE      = "C:\NetAgent\server_block.log"
# ──────────────────────────────────────────────────────────

function Write-Log([string]$msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [BLOCK] $msg"
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
    Write-Host $line
}

Write-Log "Blocking internet for $DeviceIP ..."

# ── Method 1: RRAS IP Packet Filter ───────────────────────
# Blocks traffic FROM device hitting LAN interface (INPUT = arriving at this router)
# and TO device leaving LAN interface (OUTPUT = leaving toward client)
try {
    $r1 = netsh routing ip add filter `
        name="$LAN_INTERFACE" filtertype=INPUT `
        srcaddr=$DeviceIP srcmask=255.255.255.255 `
        dstaddr=0.0.0.0 dstmask=0.0.0.0 proto=ANY 2>&1
    Write-Log "RRAS INPUT filter: $r1"

    $r2 = netsh routing ip add filter `
        name="$LAN_INTERFACE" filtertype=OUTPUT `
        dstaddr=$DeviceIP dstmask=255.255.255.255 `
        srcaddr=0.0.0.0 srcmask=0.0.0.0 proto=ANY 2>&1
    Write-Log "RRAS OUTPUT filter: $r2"
} catch {
    Write-Log "RRAS filter failed (RRAS may not be installed): $_"
}

# ── Method 2: Windows Firewall rules (redundant layer) ────
# Blocks forwarded traffic at the Windows Firewall level
try {
    # Remove stale rules first
    Remove-NetFirewallRule -DisplayName "UsageBlock_OUT_$DeviceIP" -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName "UsageBlock_IN_$DeviceIP"  -ErrorAction SilentlyContinue

    New-NetFirewallRule `
        -DisplayName "UsageBlock_OUT_$DeviceIP" `
        -Direction Outbound `
        -RemoteAddress $DeviceIP `
        -Action Block -Protocol Any -Enabled True `
        -ErrorAction Stop | Out-Null
    Write-Log "Firewall OUT rule added"

    New-NetFirewallRule `
        -DisplayName "UsageBlock_IN_$DeviceIP" `
        -Direction Inbound `
        -RemoteAddress $DeviceIP `
        -Action Block -Protocol Any -Enabled True `
        -ErrorAction Stop | Out-Null
    Write-Log "Firewall IN rule added"
} catch {
    Write-Log "Firewall rule error: $_"
}

# ── Method 3: Null-route host route ───────────────────────
# Redirects any traffic FROM this gateway TO the client IP to loopback
try {
    $r3 = route ADD $DeviceIP MASK 255.255.255.255 127.0.0.1 METRIC 1 2>&1
    Write-Log "Null route: $r3"
} catch {
    Write-Log "Null route error: $_"
}

Write-Log "Block complete for $DeviceIP"
