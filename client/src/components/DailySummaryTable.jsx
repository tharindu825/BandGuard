import { useState, useMemo } from 'react'

const fmtMb = (mb) => {
  if (!mb) return '0 MB'
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(1)} MB`
}

/**
 * DailySummaryTable — sortable table of today's usage across all devices
 */
export default function DailySummaryTable({ devices, todaySummary }) {
  const [sort,    setSort]    = useState({ col: 'total_mb', dir: 'desc' })
  const [search,  setSearch]  = useState('')

  // Merge device info with today's summary
  const rows = useMemo(() => {
    return devices.map(d => {
      const s = todaySummary?.find(x => x.device_name === d.device_name) || {}
      return {
        device_name:    d.device_name,
        device_ip:      d.device_ip,
        download_mb:    s.download_mb  || 0,
        upload_mb:      s.upload_mb    || 0,
        total_mb:       s.total_mb     || 0,
        dl_limit_mb:    d.dl_limit_mb  || 0,
        ul_limit_mb:    d.ul_limit_mb  || 0,
        total_limit_mb: d.total_limit_mb || 0,
        is_blocked:     d.is_blocked,
        is_online:      d.is_online,
      }
    })
    .filter(r =>
      r.device_name.toLowerCase().includes(search.toLowerCase()) ||
      r.device_ip.includes(search)
    )
    .sort((a, b) => {
      const v = sort.dir === 'asc' ? 1 : -1
      if (typeof a[sort.col] === 'string') {
        return v * a[sort.col].localeCompare(b[sort.col])
      }
      return v * (a[sort.col] - b[sort.col])
    })
  }, [devices, todaySummary, sort, search])

  function toggleSort(col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))
  }

  function SortIcon({ col }) {
    if (sort.col !== col) return <span style={{ opacity: 0.3 }}>↕</span>
    return <span>{sort.dir === 'asc' ? '↑' : '↓'}</span>
  }

  function QuotaStatus({ used, limit }) {
    if (!limit) return <span style={{ color: 'var(--text-dim)' }}>∞</span>
    const pct = (used / limit) * 100
    const color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)'
    return <span style={{ color, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <input
          id="device-search"
          type="text"
          placeholder="Search device or IP…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="quota-input"
          style={{ maxWidth: 280 }}
        />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('device_name')} style={{ cursor: 'pointer' }}>
                Device <SortIcon col="device_name" />
              </th>
              <th>Status</th>
              <th onClick={() => toggleSort('download_mb')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                ↓ Download <SortIcon col="download_mb" />
              </th>
              <th onClick={() => toggleSort('upload_mb')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                ↑ Upload <SortIcon col="upload_mb" />
              </th>
              <th onClick={() => toggleSort('total_mb')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                Total <SortIcon col="total_mb" />
              </th>
              <th style={{ textAlign: 'right' }}>DL Quota</th>
              <th style={{ textAlign: 'right' }}>UL Quota</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>
                  No devices found
                </td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.device_name}>
                <td>
                  <div className="col-name">{r.device_name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                    {r.device_ip}
                  </div>
                </td>
                <td>
                  {r.is_blocked
                    ? <span className="badge badge-blocked"><span className="badge-dot"/>BLOCKED</span>
                    : r.is_online
                      ? <span className="badge badge-online"><span className="badge-dot"/>Online</span>
                      : <span className="badge badge-offline"><span className="badge-dot"/>Offline</span>
                  }
                </td>
                <td className="col-number">{fmtMb(r.download_mb)}</td>
                <td className="col-number">{fmtMb(r.upload_mb)}</td>
                <td className="col-number" style={{ fontWeight: 600 }}>{fmtMb(r.total_mb)}</td>
                <td className="col-number">
                  <QuotaStatus used={r.download_mb} limit={r.dl_limit_mb} />
                </td>
                <td className="col-number">
                  <QuotaStatus used={r.upload_mb} limit={r.ul_limit_mb} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
