import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BlockBadge from './BlockBadge.jsx'
import UsageBar   from './UsageBar.jsx'

/**
 * DeviceCard — per-device card with usage bars, quota editor,
 * block/unblock controls, and navigation to detail page.
 */
export default function DeviceCard({ device, todaySummary, onAction, onToast }) {
  const navigate = useNavigate()
  const [showQuota, setShowQuota] = useState(false)
  const [dlLimit,   setDlLimit]   = useState(device.dl_limit_mb    || '')
  const [ulLimit,   setUlLimit]   = useState(device.ul_limit_mb    || '')
  const [totLimit,  setTotLimit]  = useState(device.total_limit_mb || '')
  const [saving,    setSaving]    = useState(false)
  const [blocking,  setBlocking]  = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const today = todaySummary?.find(s => s.device_name === device.device_name) || {}
  const dlMb    = today.download_mb || 0
  const ulMb    = today.upload_mb   || 0
  const totalMb = today.total_mb    || 0

  const lastSeen = device.last_seen
    ? new Date(device.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Never'

  // ── Save quota ───────────────────────────────────────────
  async function saveQuota() {
    setSaving(true)
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(device.device_name)}/limit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dl_limit_mb:    parseInt(dlLimit)  || 0,
          ul_limit_mb:    parseInt(ulLimit)  || 0,
          total_limit_mb: parseInt(totLimit) || 0,
        })
      })
      if (res.ok) {
        onToast?.({ msg: `Quota saved for ${device.device_name}`, type: 'success' })
        onAction?.()
        setShowQuota(false)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Block / unblock ──────────────────────────────────────
  async function toggleBlock() {
    setBlocking(true)
    const action = device.is_blocked ? 'unblock' : 'block'
    try {
      await fetch(`/api/devices/${encodeURIComponent(device.device_name)}/${action}`, {
        method: 'PUT'
      })
      onToast?.({
        msg:  `${device.device_name} ${action}ed`,
        type: action === 'unblock' ? 'success' : 'error'
      })
      onAction?.()
    } finally {
      setBlocking(false)
    }
  }

  // ── Reset today's usage ─────────────────────────────────
  async function resetUsage() {
    setResetting(true)
    setConfirmReset(false)
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(device.device_name)}/reset-usage`, {
        method: 'POST'
      })
      const data = await res.json()
      onToast?.({
        msg:  `Usage reset for ${device.device_name}${data.unblocked ? ' (also unblocked)' : ''}`,
        type: 'success'
      })
      onAction?.()
    } catch {
      onToast?.({ msg: 'Reset failed', type: 'error' })
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className={`device-card ${device.is_blocked ? 'blocked' : ''}`}>

      {/* Top row */}
      <div className="device-card-top">
        <div className="device-name-row">
          <span
            id={`device-name-${device.device_name}`}
            className="device-name"
            onClick={() => navigate(`/device/${encodeURIComponent(device.device_name)}`)}
            title="Click for 30-day history"
          >
            {device.device_name}
          </span>
          <span className="device-ip">{device.device_ip}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
            Last: {lastSeen}
          </span>
        </div>
        <div className="device-badges">
          <BlockBadge isOnline={device.is_online} isBlocked={!!device.is_blocked} />
        </div>
      </div>

      {/* Usage bars */}
      <div className="usage-section">
        <UsageBar label="↓ Download" usedMb={dlMb}    limitMb={device.dl_limit_mb}    />
        <UsageBar label="↑ Upload"   usedMb={ulMb}    limitMb={device.ul_limit_mb}    />
        {device.total_limit_mb > 0 && (
          <UsageBar label="≡ Total"  usedMb={totalMb} limitMb={device.total_limit_mb} />
        )}
        {device.total_limit_mb === 0 && device.dl_limit_mb === 0 && device.ul_limit_mb === 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textAlign: 'center', padding: '4px 0' }}>
            No quota set
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="quota-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <button
            id={`quota-toggle-${device.device_name}`}
            className="quota-toggle-btn"
            onClick={() => setShowQuota(v => !v)}
          >
            {showQuota ? '▲' : '▼'} {showQuota ? 'Hide' : 'Set'} Quota
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              id={`reset-btn-${device.device_name}`}
              className="btn btn-sm btn-warning"
              onClick={() => setConfirmReset(true)}
              disabled={resetting}
              title="Reset today's download & upload data to zero"
            >
              {resetting ? '…' : '↺ Reset'}
            </button>
            <button
              id={`block-btn-${device.device_name}`}
              className={`btn btn-sm ${device.is_blocked ? 'btn-success' : 'btn-danger'}`}
              onClick={toggleBlock}
              disabled={blocking}
            >
              {blocking ? '…' : device.is_blocked ? '✓ Unblock' : '⊘ Block'}
            </button>
          </div>
        </div>

        {/* Confirm Reset Dialog */}
        {confirmReset && (
          <div className="confirm-reset-box">
            <span>⚠ Reset today's usage for <strong>{device.device_name}</strong>?</span>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn btn-sm btn-warning" onClick={resetUsage}>
                ✓ Yes, Reset
              </button>
              <button className="btn btn-sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {showQuota && (
          <div className="quota-form">
            <div className="quota-field">
              <label htmlFor={`dl-${device.device_name}`}>DL Limit (MB)</label>
              <input
                id={`dl-${device.device_name}`}
                type="number"
                min="0"
                className="quota-input"
                placeholder="0 = unlimited"
                value={dlLimit}
                onChange={e => setDlLimit(e.target.value)}
              />
            </div>
            <div className="quota-field">
              <label htmlFor={`ul-${device.device_name}`}>UL Limit (MB)</label>
              <input
                id={`ul-${device.device_name}`}
                type="number"
                min="0"
                className="quota-input"
                placeholder="0 = unlimited"
                value={ulLimit}
                onChange={e => setUlLimit(e.target.value)}
              />
            </div>
            <div className="quota-field">
              <label htmlFor={`tot-${device.device_name}`}>Total Limit (MB)</label>
              <input
                id={`tot-${device.device_name}`}
                type="number"
                min="0"
                className="quota-input"
                placeholder="0 = unlimited"
                value={totLimit}
                onChange={e => setTotLimit(e.target.value)}
              />
            </div>
            <div className="quota-actions">
              <button
                id={`save-quota-${device.device_name}`}
                className="btn btn-primary btn-sm"
                onClick={saveQuota}
                disabled={saving}
              >
                {saving ? 'Saving…' : '✓ Save'}
              </button>
              <button className="btn btn-sm" onClick={() => setShowQuota(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
