# ============================================================
# Internet Usage Agent v8.1
# Deploy to each PC at: C:\NetAgent\agent.ps1
# Runs every 60 seconds via Task Scheduler as SYSTEM
#
# v8.1 Changes:
#   - Auto-detects real gateway at startup (no hardcoding)
#   - Works on any PC regardless of gateway IP
#   - Block = change default gateway to 192.168.1.11
#   - Unblock = restore auto-detected real gateway
# ============================================================

$SERVER_URL         = "http://192.168.1.32:3000/api/usage"
$SERVER_URL_BASE    = "http://192.168.1.32:3000"
$DEVICE_NAME        = $env:COMPUTERNAME
$INTERVAL           = 15   # seconds between snapshots
$STATUS_CHECK_EVERY = 4    # check block status every 4 x 15s = 60s
$statusCheckCounter = 0

$BLOCKED_GATEWAY    = "192.168.1.11"   # dead-end gateway — never changes

# ── Auto-detect real gateway at startup ───────────────────
# Reads whatever gateway is currently set (works on any PC)
# Excludes the blocked gateway in case PC rebooted while blocked
$REAL_GATEWAY = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" `
                     -ErrorAction SilentlyContinue |
                 Where-Object { $_.NextHop -ne $BLOCKED_GATEWAY } |
                 Sort-Object RouteMetric |
                 Select-Object -First 1 -ExpandProperty NextHop)

# Fallback if auto-detect fails
if (-not $REAL_GATEWAY -or $REAL_GATEWAY -eq "") {
    $REAL_GATEWAY = "192.168.1.4"
}

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
        $ip -match '^10\.'                          -or
        $ip -match '^192\.168\.'                    -or
        $ip -match '^172\.(1[6-9]|2[0-9]|3[01])\.' -or
        $ip -match '^127\.'                         -or
        $ip -match '^169\.254\.'                    -or
        $ip -match '^0\.'                           -or
        $ip -match '^::'                            -or
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
    $nic           = Get-NICBytes
    $internetTCP   = Get-InternetTCPCount
    $lanTCP        = Get-LANTCPCount
    $internetUDP   = Get-InternetUDPCount
    $totalInternet = $internetTCP + $internetUDP

    return @{
        TotalRx       = $nic.Rx
        TotalTx       = $nic.Tx
        InternetConns = $totalInternet
        LANConns      = $lanTCP
        HasInternet   = ($totalInternet -gt 0)
        HasLANOnly    = ($totalInternet -eq 0 -and $lanTCP -gt 0)
    }
}

# ── Error logger with rotation ─────────────────────────────
function Write-ErrorLog([string]$msg) {
    $logPath = "C:\NetAgent\errors.log"
    Add-Content -Path $logPath `
        -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'): $msg" `
        -ErrorAction SilentlyContinue
    try {
        if ((Get-Item $logPath -ErrorAction SilentlyContinue).Length -gt 5MB) {
            Rename-Item $logPath "$logPath.old" -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

# ── Get current default gateway ────────────────────────────
function Get-DefaultGateway {
    $gw = Get-NetRoute -DestinationPrefix "0.0.0.0/0" `
              -ErrorAction SilentlyContinue |
          Sort-Object RouteMetric |
          Select-Object -First 1 -ExpandProperty NextHop
    return $gw
}

# ── Block internet: swap to dead-end gateway ───────────────
function Set-InternetBlock {
    try {
        $currentGW = Get-DefaultGateway
        if ($currentGW -ne $BLOCKED_GATEWAY) {
            # Remove all current default routes
            Get-NetRoute -DestinationPrefix "0.0.0.0/0" `
                -ErrorAction SilentlyContinue |
                Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue

            # Add dead-end gateway (persistent — survives reboot)
            New-NetRoute -DestinationPrefix "0.0.0.0/0" `
                -NextHop $BLOCKED_GATEWAY `
                -RouteMetric 1 `
                -PolicyStore PersistentStore `
                -ErrorAction Stop | Out-Null

            Write-ErrorLog "INFO: Gateway changed to $BLOCKED_GATEWAY — internet BLOCKED"
        }
    } catch {
        # Fallback to route.exe if New-NetRoute fails
        try {
            route delete 0.0.0.0 | Out-Null
            route add 0.0.0.0 mask 0.0.0.0 $BLOCKED_GATEWAY metric 1 -p | Out-Null
            Write-ErrorLog "INFO: Gateway changed via route.exe to $BLOCKED_GATEWAY — internet BLOCKED"
        } catch {
            Write-ErrorLog "ERROR: Set-InternetBlock failed: $_"
        }
    }
}

# ── Unblock internet: restore real gateway ─────────────────
function Remove-InternetBlock {
    try {
        $currentGW = Get-DefaultGateway
        if ($currentGW -ne $REAL_GATEWAY) {
            # Remove dead-end routes
            Get-NetRoute -DestinationPrefix "0.0.0.0/0" `
                -ErrorAction SilentlyContinue |
                Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue

            # Restore real gateway (persistent)
            New-NetRoute -DestinationPrefix "0.0.0.0/0" `
                -NextHop $REAL_GATEWAY `
                -RouteMetric 1 `
                -PolicyStore PersistentStore `
                -ErrorAction Stop | Out-Null

            Write-ErrorLog "INFO: Gateway restored to $REAL_GATEWAY — internet UNBLOCKED"
        }
    } catch {
        # Fallback to route.exe
        try {
            route delete 0.0.0.0 | Out-Null
            route add 0.0.0.0 mask 0.0.0.0 $REAL_GATEWAY metric 1 -p | Out-Null
            Write-ErrorLog "INFO: Gateway restored via route.exe to $REAL_GATEWAY — internet UNBLOCKED"
        } catch {
            Write-ErrorLog "ERROR: Remove-InternetBlock failed: $_"
        }
    }
}

# ── Check if currently blocked ─────────────────────────────
function Is-BlockActive {
    $currentGW = Get-DefaultGateway
    return ($currentGW -eq $BLOCKED_GATEWAY)
}

# ── Single Instance Mutex ──────────────────────────────────
$mutex = New-Object System.Threading.Mutex($false, "Global\InternetUsageTrackerAgent")
if (-not $mutex.WaitOne(0, $false)) {
    Write-Host "Agent already running. Exiting."
    exit 0
}

try {
    # Log startup info — confirm auto-detected gateway
    Write-ErrorLog "INFO: Agent v8.1 started | Device=$DEVICE_NAME | IP=$DEVICE_IP | RealGW=$REAL_GATEWAY | BlockGW=$BLOCKED_GATEWAY"

    $before = Get-SplitBytes

    while ($true) {
        Start-Sleep -Seconds $INTERVAL

        $after = Get-SplitBytes

        # ── Compute NIC byte deltas ────────────────────────
        $deltaRx = [long]$after.TotalRx - [long]$before.TotalRx
        $deltaTx = [long]$after.TotalTx - [long]$before.TotalTx

        $before = $after

        # Guard: NIC counter reset or wraparound
        if ($deltaRx -lt 0 -or $deltaTx -lt 0) { continue }

        # ── EARLY EXIT: Pure LAN-only activity (SMB etc.) ──
        if ($after.HasLANOnly) { continue }

        # ── EARLY EXIT: No connections + tiny background noise
        $hasTraffic = ($deltaRx -gt 1024 -or $deltaTx -gt 512)
        if (-not $after.HasInternet -and -not $hasTraffic) { continue }

        # ── PRO-RATING: Mixed LAN + Internet simultaneously ─
        $totalConns    = $after.InternetConns + $after.LANConns
        $internetRatio = if ($totalConns -gt 0) {
                             [double]$after.InternetConns / [double]$totalConns
                         } else { 1.0 }

        $reportRx = if ($after.LANConns -gt 0 -and $after.InternetConns -gt 0) {
                        [long]($deltaRx * $internetRatio)
                    } else { $deltaRx }

        $reportTx = if ($after.LANConns -gt 0 -and $after.InternetConns -gt 0) {
                        [long]($deltaTx * $internetRatio)
                    } else { $deltaTx }

        # ── SEND usage to server ───────────────────────────
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

        # ── SELF-ENFORCEMENT: Poll server for block status ─
        $statusCheckCounter++
        if ($statusCheckCounter -ge $STATUS_CHECK_EVERY) {
            $statusCheckCounter = 0

            try {
                $statusUrl    = "$SERVER_URL_BASE/api/devices/status/$DEVICE_NAME"
                $deviceStatus = Invoke-RestMethod -Uri $statusUrl -Method GET `
                                    -TimeoutSec 5 -ErrorAction Stop

                $blockActive = Is-BlockActive

                if ($deviceStatus.is_blocked -eq 1 -and -not $blockActive) {
                    Set-InternetBlock

                } elseif ($deviceStatus.is_blocked -eq 0 -and $blockActive) {
                    Remove-InternetBlock
                }

            } catch {
                Write-ErrorLog "Status check failed: $_"
            }
        }
    }

} finally {
    $mutex.ReleaseMutex()
}