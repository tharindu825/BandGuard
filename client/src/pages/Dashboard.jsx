import { useState, useEffect, useCallback } from 'react'
import DeviceCard        from '../components/DeviceCard.jsx'
import DailySummaryTable from '../components/DailySummaryTable.jsx'

const REFRESH_INTERVAL = 30_000   // 30 seconds

const fmtMb = (mb) => {
  if (!mb) return '0 MB'
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${parseFloat(mb).toFixed(1)} MB`
}

export default function Dashboard() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [toast,       setToast]       = useState(null)
  const [activeTab,   setActiveTab]   = useState('cards')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('API error')
      const json = await res.json()
      setData(json)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(timer)
  }, [fetchData])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function showToast(payload) {
    setToast(payload)
  }

  // ── Derived stats ──────────────────────────────────────
  const devices      = data?.devices      || []
  const todaySummary = data?.today_summary || []

  const totalDevices   = devices.length
  const onlineDevices  = devices.filter(d => d.is_online).length
  const blockedDevices = devices.filter(d => d.is_blocked).length
  const totalDlMb      = todaySummary.reduce((s, r) => s + (r.download_mb || 0), 0)
  const totalUlMb      = todaySummary.reduce((s, r) => s + (r.upload_mb   || 0), 0)
  const totalMbAll     = todaySummary.reduce((s, r) => s + (r.total_mb    || 0), 0)

  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'

  if (loading) {
    return (
      <div className="page-wrapper">
        <div className="loading-spinner">
          <div className="spinner" />
          <span>Loading usage data…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrapper">

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">📡</div>
          <div>
            <h1>Usage Tracker</h1>
            <div className="header-subtitle">Internet-only bandwidth monitoring · Auto-refreshes every 30s</div>
          </div>
        </div>
        <div className="header-right">
          <span className="last-updated">Updated {formattedTime}</span>
          <button id="refresh-btn" className="btn btn-sm" onClick={fetchData}>
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-card" style={{ '--accent': 'var(--primary)' }}>
          <div className="stat-label">Total Devices</div>
          <div className="stat-value">{totalDevices}</div>
          <div className="stat-sub">registered</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--success)' }}>
          <div className="stat-label">Online Now</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{onlineDevices}</div>
          <div className="stat-sub">last 3 min</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--danger)' }}>
          <div className="stat-label">Blocked</div>
          <div className="stat-value" style={{ color: blockedDevices > 0 ? 'var(--danger)' : 'var(--text)' }}>
            {blockedDevices}
          </div>
          <div className="stat-sub">quota exceeded</div>
        </div>
        <div className="stat-card" style={{ '--accent': '#a78bfa' }}>
          <div className="stat-label">↓ Total Download</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>{fmtMb(totalDlMb)}</div>
          <div className="stat-sub">today across all devices</div>
        </div>
        <div className="stat-card" style={{ '--accent': '#34d399' }}>
          <div className="stat-label">↑ Total Upload</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>{fmtMb(totalUlMb)}</div>
          <div className="stat-sub">today across all devices</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--warning)' }}>
          <div className="stat-label">≡ Combined Total</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>{fmtMb(totalMbAll)}</div>
          <div className="stat-sub">today all traffic</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="section-header">
        <div>
          <div className="section-title">Devices</div>
          <div className="section-sub">{totalDevices} device{totalDevices !== 1 ? 's' : ''} · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <div className="tabs">
          <button
            id="tab-cards"
            className={`tab-btn ${activeTab === 'cards' ? 'active' : ''}`}
            onClick={() => setActiveTab('cards')}
          >
            ☰ Cards
          </button>
          <button
            id="tab-table"
            className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`}
            onClick={() => setActiveTab('table')}
          >
            ≡ Table
          </button>
        </div>
      </div>

      {/* Cards view */}
      {activeTab === 'cards' && (
        devices.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🖥️</span>
            <span>No devices yet. Deploy the agent to your PCs.</span>
          </div>
        ) : (
          <div className="device-grid">
            {devices.map(d => (
              <DeviceCard
                key={d.device_name}
                device={d}
                todaySummary={todaySummary}
                onAction={fetchData}
                onToast={showToast}
              />
            ))}
          </div>
        )
      )}

      {/* Table view */}
      {activeTab === 'table' && (
        <div style={{ marginBottom: 48 }}>
          <DailySummaryTable devices={devices} todaySummary={todaySummary} />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type || 'info'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
