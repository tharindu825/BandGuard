# ============================================================
# Internet Usage Agent v7.0
# Deploy to each PC at: C:\NetAgent\agent.ps1
# Runs every 60 seconds via Task Scheduler as SYSTEM
# 
# Fixes in v7.0:
#   - True internet-only tracking (excludes SMB/LAN traffic)
#   - UDP/QUIC detection (YouTube, Netflix, HTTP/3)
#   - Pro-rating when LAN + Internet active simultaneously
#   - Early exit for pure LAN-only activity
# ============================================================

$SERVER_URL  = "http://SERVER_IP:3000/api/usage"   # <-- SET THIS during install
$DEVICE_NAME = $env:COMPUTERNAME
$INTERVAL    = 15   # seconds between snapshots

# ── Resolve local IPv4 address ─────────────────────────────
$DEVICE_IP = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
              Where-Object {
                  $_.IPAddress -notmatch '^127\.' -and
                  $_.PrefixOrigin -ne 'WellKnown' -and
                  $_.IPAddress -ne '0.0.0.0'
              } | Select-Object -First 1).IPAddress

if (-not $DEVICE_IP) { $DEVICE_IP = "0.0.0.0" }

# ── RFC1918 + special range check ─────────────────────────
function Is-PrivateIP([string]$ip) {
    if ([string]::IsNullOrWhiteSpace($ip)) { return $true }
    return (
        $ip -match '^10\.'                          -or   # Class A private
        $ip -match '^192\.168\.'                    -or   # Class C private
        $ip -match '^172\.(1[6-9]|2[0-9]|3[01])\.' -or   # Class B private
        $ip -match '^127\.'                         -or   # Loopback
        $ip -match '^169\.254\.'                    -or   # APIPA / link-local
        $ip -match '^0\.'                           -or   # Unspecified
        $ip -match '^::'                            -or   # IPv6 loopback/unspecified
        $ip -eq '0.0.0.0'                           -or
        $ip -eq ''
    )
}

# ── Read total NIC bytes (all adapters combined) ───────────
function Get-NICBytes {
    $stats = Get-NetAdapterStatistics -ErrorAction SilentlyContinue |
             Where-Object { $_.ReceivedBytes -gt 0 -or $_.SentBytes -gt 0 }
    if (-not $stats) { return @{ Rx = [long]0; Tx = [long]0 } }
    return @{
        Rx = [long]($stats | Measure-Object ReceivedBytes -Sum).Sum
        Tx = [long]($stats | Measure-Object SentBytes     -Sum).Sum
    }
}

# ── Count TCP connections to public IPs (internet) ─────────
function Get-InternetTCPCount {
    $conns = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
             Where-Object { -not (Is-PrivateIP $_.RemoteAddress) }
    return @($conns).Count
}

# ── Count TCP connections to private IPs (LAN/SMB) ─────────
function Get-LANTCPCount {
    $conns = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
             Where-Object { Is-PrivateIP $_.RemoteAddress }
    return @($conns).Count
}

# ── Count UDP endpoints to public IPs (QUIC/YouTube/HTTP3) ─
function Get-InternetUDPCount {
    try {
        $udp = Get-NetUDPEndpoint -ErrorAction SilentlyContinue |
               Where-Object { -not (Is-PrivateIP $_.RemoteAddress) }
        return @($udp).Count
    } catch {
        return 0
    }
}

# ── Combined snapshot: NIC bytes + connection profile ──────
function Get-SplitBytes {
    $nic             = Get-NICBytes
    $internetTCP     = Get-InternetTCPCount
    $lanTCP          = Get-LANTCPCount
    $internetUDP     = Get-InternetUDPCount

    # Total "internet signals" = TCP public + UDP public (QUIC)
    $totalInternetConns = $internetTCP + $internetUDP

    return @{
        TotalRx             = $nic.Rx
        TotalTx             = $nic.Tx
        InternetConns       = $totalInternetConns   # TCP public + UDP/QUIC public
        LANConns            = $lanTCP               # TCP private (SMB, AD, etc.)
        HasInternet         = ($totalInternetConns -gt 0)
        HasLANOnly          = ($totalInternetConns -eq 0 -and $lanTCP -gt 0)
    }
}

# ── Error logger with rotation ─────────────────────────────
function Write-ErrorLog([string]$msg) {
    $logPath = "C:\NetAgent\errors.log"
    Add-Content -Path $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'): $msg" `
                -ErrorAction SilentlyContinue
    try {
        if ((Get-Item $logPath -ErrorAction SilentlyContinue).Length -gt 5MB) {
            Rename-Item $logPath "$logPath.old" -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

# ── Single Instance Mutex ──────────────────────────────────
$mutex = New-Object System.Threading.Mutex($false, "Global\InternetUsageTrackerAgent")
if (-not $mutex.WaitOne(0, $false)) {
    Write-Host "Agent already running. Exiting."
    exit 0
}

try {
    $before = Get-SplitBytes

    while ($true) {
        Start-Sleep -Seconds $INTERVAL

        $after = Get-SplitBytes

        # ── Compute NIC byte deltas ────────────────────────
        $deltaRx = [long]$after.TotalRx - [long]$before.TotalRx
        $deltaTx = [long]$after.TotalTx - [long]$before.TotalTx

        # Advance baseline — always move forward
        $before = $after

        # Guard: NIC counter reset or wraparound
        if ($deltaRx -lt 0 -or $deltaTx -lt 0) { continue }

        # ── EARLY EXIT: Pure LAN-only activity ────────────
        # No internet connections (TCP or UDP/QUIC) but LAN connections exist
        # → this delta is entirely SMB / LAN traffic → discard
        if ($after.HasLANOnly) { continue }

        # ── EARLY EXIT: No connections at all + tiny traffic
        # (background noise, ARP, broadcasts)
        $hasTraffic = ($deltaRx -gt 1024 -or $deltaTx -gt 512)
        if (-not $after.HasInternet -and -not $hasTraffic) { continue }

        # ── PRO-RATING: Mixed LAN + Internet simultaneously ─
        # Example: SMB file copy + YouTube playing at same time
        # Attribute bytes proportionally by connection count ratio
        $totalConns    = $after.InternetConns + $after.LANConns
        $internetRatio = if ($totalConns -gt 0) {
                             [double]$after.InternetConns / [double]$totalConns
                         } else { 1.0 }

        # Apply ratio only when LAN connections are also present
        $reportRx = if ($after.LANConns -gt 0 -and $after.InternetConns -gt 0) {
                        [long]($deltaRx * $internetRatio)
                    } else { $deltaRx }

        $reportTx = if ($after.LANConns -gt 0 -and $after.InternetConns -gt 0) {
                        [long]($deltaTx * $internetRatio)
                    } else { $deltaTx }

        # ── SEND to server ─────────────────────────────────
        if ($after.HasInternet -and ($reportRx -gt 0 -or $reportTx -gt 0)) {
            $payload = @{
                device_name    = $DEVICE_NAME
                device_ip      = $DEVICE_IP
                download_bytes = $reportRx
                upload_bytes   = $reportTx
                timestamp      = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                date           = (Get-Date -Format "yyyy-MM-dd")
            } | ConvertTo-Json

            try {
                Invoke-RestMethod -Uri $SERVER_URL -Method POST `
                    -Body $payload -ContentType "application/json" `
                    -TimeoutSec 10 -ErrorAction Stop | Out-Null
            } catch {
                Write-ErrorLog "POST failed: $_"
            }
        }
    }

} finally {
    $mutex.ReleaseMutex()
}
