# ============================================================
# Internet Usage Agent v5.0
# Deploy to each PC at: C:\NetAgent\agent.ps1
# Runs every 60 seconds via Task Scheduler as SYSTEM
# ============================================================

$SERVER_URL  = "http://SERVER_IP:3000/api/usage"   # <-- SET THIS during install
$DEVICE_NAME = $env:COMPUTERNAME
$INTERVAL    = 15   # seconds between byte-count snapshots (fast responsive UI)

# Resolve local (non-loopback) IPv4 address
$DEVICE_IP = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
              Where-Object {
                  $_.IPAddress -notmatch '^127\.' -and
                  $_.PrefixOrigin -ne 'WellKnown' -and
                  $_.IPAddress -ne '0.0.0.0'
              } | Select-Object -First 1).IPAddress

if (-not $DEVICE_IP) { $DEVICE_IP = "0.0.0.0" }

# ── RFC1918 + special range exclusion ──────────────────────
# Returns $true if the IP is private/local (LAN/loopback/link-local)
function Is-PrivateIP([string]$ip) {
    if ([string]::IsNullOrWhiteSpace($ip)) { return $true }
    return (
        $ip -match '^10\.'                        -or   # Class A private
        $ip -match '^192\.168\.'                  -or   # Class C private
        $ip -match '^172\.(1[6-9]|2[0-9]|3[01])\.' -or # Class B private
        $ip -match '^127\.'                       -or   # Loopback
        $ip -match '^169\.254\.'                  -or   # Link-local (APIPA)
        $ip -match '^0\.'                         -or   # Unspecified
        $ip -match '^::'                          -or   # IPv6 loopback/unspecified
        $ip -eq '0.0.0.0'                         -or
        $ip -eq ''
    )
}

# ── Read total NIC bytes (all adapters combined) ────────────
function Get-NICBytes {
    $stats = Get-NetAdapterStatistics -ErrorAction SilentlyContinue |
             Where-Object { $_.ReceivedBytes -gt 0 -or $_.SentBytes -gt 0 }
    if (-not $stats) { return @{ Rx = [long]0; Tx = [long]0 } }
    return @{
        Rx = [long]($stats | Measure-Object ReceivedBytes -Sum).Sum
        Tx = [long]($stats | Measure-Object SentBytes     -Sum).Sum
    }
}

# ── Count active established TCP connections to public IPs ──
function Get-InternetConnectionCount {
    $conns = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
             Where-Object { -not (Is-PrivateIP $_.RemoteAddress) }
    return @($conns).Count
}

# ── Log errors locally ──────────────────────────────────────
function Write-ErrorLog([string]$msg) {
    $logPath = "C:\NetAgent\errors.log"
    $line    = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'): $msg"
    Add-Content -Path $logPath -Value $line -ErrorAction SilentlyContinue
    # Rotate if >5 MB
    try {
        if (Test-Path $logPath) {
            if ((Get-Item $logPath).Length -gt 5MB) {
                Rename-Item $logPath "$logPath.old" -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

# ── Single Instance Mutex ──────────────────────────────────
$mutexName = "Global\InternetUsageTrackerAgent"
$mutex = New-Object System.Threading.Mutex($false, $mutexName)

if (-not $mutex.WaitOne(0, $false)) {
    Write-Host "Agent already running. Exiting."
    exit 0
}

try {
    # ── Main sampling loop (Infinite) ──────────────────────────
    $before = Get-NICBytes
    
    while ($true) {
        $connsBefore = Get-InternetConnectionCount
        Start-Sleep -Seconds $INTERVAL
        
        $after      = Get-NICBytes
        $connsAfter = Get-InternetConnectionCount
        
        # Compute deltas
        $deltaRx = [long]$after.Rx - [long]$before.Rx
        $deltaTx = [long]$after.Tx - [long]$before.Tx
        
        # Advance the counter to avoid losing any traffic between loops!
        $before = $after
        
        # Guard: negative delta means NIC counter was reset
        if ($deltaRx -lt 0 -or $deltaTx -lt 0) { continue }
        
        # We consider UDP endpoints or active internet profile as fallback to catch YouTube/QUIC
        # If there are no active connections, but we are online, we report large traffic to not drop video streaming data.
        $hasInternet = ($connsBefore -gt 0 -or $connsAfter -gt 0 -or (Get-NetConnectionProfile -IPv4Connectivity Internet -ErrorAction SilentlyContinue).Count -gt 0)
        
        $hasTraffic  = ($deltaRx -gt 1024 -or $deltaTx -gt 512)
        
        if ($hasInternet -and $hasTraffic) {
            $payload = @{
                device_name    = $DEVICE_NAME
                device_ip      = $DEVICE_IP
                download_bytes = $deltaRx
                upload_bytes   = $deltaTx
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
