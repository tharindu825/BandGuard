/**
 * UsageBar — animated progress bar with color zones
 * pct: 0-100+
 */
export default function UsageBar({ label, usedMb, limitMb, color }) {
  const hasLimit = limitMb > 0
  const pct      = hasLimit ? Math.min((usedMb / limitMb) * 100, 100) : 0
  const fillClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'safe'

  const fmt = (mb) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
    return `${mb.toFixed(1)} MB`
  }

  return (
    <div>
      <div className="usage-row">
        <span className="usage-label">{label}</span>
        <span className="usage-value">
          {fmt(usedMb)}
          {hasLimit && (
            <span className="usage-limit-text"> / {fmt(limitMb)}</span>
          )}
          {!hasLimit && <span className="usage-limit-text"> (∞)</span>}
        </span>
      </div>
      {hasLimit && (
        <div className="progress-bar-wrap">
          <div
            className={`progress-bar-fill ${fillClass}`}
            style={{ width: `${pct}%` }}
            title={`${pct.toFixed(1)}% used`}
          />
        </div>
      )}
      {!hasLimit && (
        <div className="progress-bar-wrap">
          <div
            className="progress-bar-fill safe"
            style={{ width: '100%', opacity: 0.2 }}
          />
        </div>
      )}
    </div>
  )
}
