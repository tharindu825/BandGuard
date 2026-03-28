import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import UsageChart from '../components/UsageChart.jsx'
import BlockBadge from '../components/BlockBadge.jsx'
import UsageBar   from '../components/UsageBar.jsx'

const fmtMb   = (mb)   => mb >= 1024 ? `${(mb/1024).toFixed(2)} GB` : `${parseFloat(mb||0).toFixed(1)} MB`
const fmtDate = (date) => new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function DeviceDetail() {
  const { name }    = useParams()
  const navigate    = useNavigate()
  const deviceName  = decodeURIComponent(name)

  const [device,    setDevice]    = useState(null)
  const [history,   setHistory]   = useState([])
  const [today,     setToday]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [toast,     setToast]     = useState(null)
  const [blocking,  setBlocking]  = useState(false)
  const [dlLimit,   setDlLimit]   = useState('')
  const [ulLimit,   setUlLimit]   = useState('')
  const [totLimit,  setTotLimit]  = useState('')
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [dashRes, histRes] = await Promise.all([
          fetch('/api/dashboard'),
          fetch(`/api/history/${encodeURIComponent(deviceName)}`)
        ])
        const dash = await dashRes.json()
        const hist = await histRes.json()
        if (!active) return

        const dev = dash.devices?.find(d => d.device_name === deviceName)
        setDevice(dev || null)
        setHistory(hist)

        if (dev) {
          setDlLimit(dev.dl_limit_mb    || '')
          setUlLimit(dev.ul_limit_mb    || '')
          setTotLimit(dev.total_limit_mb || '')
        }

        const todayStr = new Date().toISOString().split('T')[0]
        const todayRow = dash.today_summary?.find(s => s.device_name === deviceName)
        setToday(todayRow || null)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [deviceName])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function saveQuota() {
    setSaving(true)
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(deviceName)}/limit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dl_limit_mb:    parseInt(dlLimit)  || 0,
          ul_limit_mb:    parseInt(ulLimit)  || 0,
          total_limit_mb: parseInt(totLimit) || 0,
        })
      })
      if (res.ok) {
        setToast({ msg: 'Quota saved', type: 'success' })
        setDevice(d => ({
          ...d,
          dl_limit_mb:    parseInt(dlLimit)  || 0,
          ul_limit_mb:    parseInt(ulLimit)  || 0,
          total_limit_mb: parseInt(totLimit) || 0,
        }))
      }
    } finally {
      setSaving(false)
    }
  }

  async function toggleBlock() {
    if (!device) return
    setBlocking(true)
    const action = device.is_blocked ? 'unblock' : 'block'
    try {
      await fetch(`/api/devices/${encodeURIComponent(deviceName)}/${action}`, { method: 'PUT' })
      setToast({ msg: `Device ${action}ed`, type: action === 'unblock' ? 'success' : 'error' })
      setDevice(d => ({ ...d, is_blocked: action === 'block' ? 1 : 0 }))
    } finally {
      setBlocking(false)
    }
  }

  if (loading) {
    return (
      <div className="page-wrapper">
        <div className="loading-spinner">
          <div className="spinner" />
          <span>Loading device data…</span>
        </div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="page-wrapper">
        <button className="back-link" onClick={() => navigate(-1)}>← Back</button>
        <div className="empty-state">
          <span className="empty-icon">❓</span>
          <span>Device "{deviceName}" not found.</span>
        </div>
      </div>
    )
  }

  // 7-day history subset for secondary chart
  const last7 = history.slice(-7)

  // Summary stats from history
  const totalDl  = history.reduce((s, r) => s + (r.download_mb || 0), 0)
  const totalUl  = history.reduce((s, r) => s + (r.upload_mb || 0), 0)
  const peakDay  = [...history].sort((a, b) => b.total_mb - a.total_mb)[0]

  return (
    <div className="page-wrapper">

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">🖥️</div>
          <div>
            <h1>{deviceName}</h1>
            <div className="header-subtitle">{device.device_ip} · 30-day history</div>
          </div>
        </div>
        <div className="header-right">
          <button
            id="block-detail-btn"
            className={`btn ${device.is_blocked ? 'btn-success' : 'btn-danger'}`}
            onClick={toggleBlock}
            disabled={blocking}
          >
            {blocking ? '…' : device.is_blocked ? '✓ Unblock Device' : '⊘ Block Device'}
          </button>
          <button className="btn" onClick={() => navigate('/')}>← Dashboard</button>
        </div>
      </header>

      {/* Status + today row */}
      <div className="stats-bar" style={{ marginBottom: 28 }}>
        <div className="stat-card" style={{ '--accent': 'var(--primary)' }}>
          <div className="stat-label">Status</div>
          <div style={{ marginTop: 6 }}>
            <BlockBadge isOnline={device.is_online} isBlocked={!!device.is_blocked} />
          </div>
        </div>
        <div className="stat-card" style={{ '--accent': '#6366f1' }}>
          <div className="stat-label">↓ Today Download</div>
          <div className="stat-value" style={{ fontSize: '1.4rem' }}>{fmtMb(today?.download_mb || 0)}</div>
        </div>
        <div className="stat-card" style={{ '--accent': '#10b981' }}>
          <div className="stat-label">↑ Today Upload</div>
          <div className="stat-value" style={{ fontSize: '1.4rem' }}>{fmtMb(today?.upload_mb || 0)}</div>
        </div>
        <div className="stat-card" style={{ '--accent': '#f59e0b' }}>
          <div className="stat-label">30-day DL Total</div>
          <div className="stat-value" style={{ fontSize: '1.4rem' }}>{fmtMb(totalDl)}</div>
        </div>
        <div className="stat-card" style={{ '--accent': '#ef4444' }}>
          <div className="stat-label">Peak Day</div>
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>
            {peakDay ? fmtMb(peakDay.total_mb) : '—'}
          </div>
          <div className="stat-sub">{peakDay ? fmtDate(peakDay.date) : ''}</div>
        </div>
      </div>

      {/* Today quota bars */}
      <div className="chart-wrap" style={{ marginBottom: 24 }}>
        <div className="chart-title">Today's Quota Usage</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <UsageBar label="↓ Download" usedMb={today?.download_mb || 0} limitMb={device.dl_limit_mb} />
          <UsageBar label="↑ Upload"   usedMb={today?.upload_mb   || 0} limitMb={device.ul_limit_mb} />
          {device.total_limit_mb > 0 && (
            <UsageBar label="≡ Total"  usedMb={today?.total_mb || 0}    limitMb={device.total_limit_mb} />
          )}
        </div>
      </div>

      {/* Charts */}
      <UsageChart data={history} title="30-Day Usage History" />
      {history.length >= 7 && (
        <UsageChart data={last7} title="Last 7 Days" />
      )}

      {/* History table */}
      <div className="section-header" style={{ marginBottom: 16 }}>
        <div className="section-title">Daily Breakdown</div>
      </div>
      <div className="table-wrap" style={{ marginBottom: 32 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th style={{ textAlign: 'right' }}>↓ Download</th>
              <th style={{ textAlign: 'right' }}>↑ Upload</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Reports</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map(row => (
              <tr key={row.date}>
                <td className="col-name">{row.date}</td>
                <td className="col-number">{fmtMb(row.download_mb)}</td>
                <td className="col-number">{fmtMb(row.upload_mb)}</td>
                <td className="col-number" style={{ fontWeight: 600 }}>{fmtMb(row.total_mb)}</td>
                <td className="col-number" style={{ color: 'var(--text-dim)' }}>{row.report_count}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32 }}>
                No history yet
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Quota editor */}
      <div className="chart-wrap">
        <div className="chart-title">Quota Settings</div>
        <div className="quota-form">
          <div className="quota-field">
            <label htmlFor="detail-dl">Download Limit (MB)</label>
            <input
              id="detail-dl"
              type="number" min="0"
              className="quota-input"
              placeholder="0 = unlimited"
              value={dlLimit}
              onChange={e => setDlLimit(e.target.value)}
            />
          </div>
          <div className="quota-field">
            <label htmlFor="detail-ul">Upload Limit (MB)</label>
            <input
              id="detail-ul"
              type="number" min="0"
              className="quota-input"
              placeholder="0 = unlimited"
              value={ulLimit}
              onChange={e => setUlLimit(e.target.value)}
            />
          </div>
          <div className="quota-field">
            <label htmlFor="detail-tot">Total Limit (MB)</label>
            <input
              id="detail-tot"
              type="number" min="0"
              className="quota-input"
              placeholder="0 = unlimited"
              value={totLimit}
              onChange={e => setTotLimit(e.target.value)}
            />
          </div>
          <div className="quota-actions">
            <button
              id="save-quota-detail"
              className="btn btn-primary"
              onClick={saveQuota}
              disabled={saving}
            >
              {saving ? 'Saving…' : '✓ Save Quota'}
            </button>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.type || 'info'}`}>{toast.msg}</div>}
    </div>
  )
}
