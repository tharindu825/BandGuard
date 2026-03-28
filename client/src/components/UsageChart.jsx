import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const fmtMb = (mb) => {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`
  return `${mb.toFixed(0)}MB`
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(13,13,36,0.97)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '12px 16px',
      fontSize: '0.82rem',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: 3 }}>
          {p.name}: <strong>{fmtMb(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

/**
 * UsageChart — Recharts bar chart for 30-day device history
 * data: array of { date, download_mb, upload_mb, total_mb }
 */
export default function UsageChart({ data, title }) {
  if (!data || data.length === 0) {
    return (
      <div className="chart-wrap">
        <div className="chart-title">{title}</div>
        <div className="empty-state">
          <span className="empty-icon">📊</span>
          No history data yet
        </div>
      </div>
    )
  }

  const formatted = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      ...d,
      dateLabel: d.date.slice(5), // MM-DD
    }))

  return (
    <div className="chart-wrap">
      <div className="chart-title">{title}</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          barSize={14} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={fmtMb}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false} tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Legend
            wrapperStyle={{ fontSize: '0.80rem', color: '#94a3b8', paddingTop: 12 }}
          />
          <Bar dataKey="download_mb" name="Download" fill="#6366f1" radius={[3,3,0,0]} />
          <Bar dataKey="upload_mb"   name="Upload"   fill="#10b981" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
