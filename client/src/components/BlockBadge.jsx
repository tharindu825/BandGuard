/**
 * BlockBadge — shows Online / Offline / BLOCKED status
 */
export default function BlockBadge({ isOnline, isBlocked }) {
  if (isBlocked) {
    return (
      <span className="badge badge-blocked">
        <span className="badge-dot" />
        BLOCKED
      </span>
    )
  }
  if (isOnline) {
    return (
      <span className="badge badge-online">
        <span className="badge-dot" />
        Online
      </span>
    )
  }
  return (
    <span className="badge badge-offline">
      <span className="badge-dot" />
      Offline
    </span>
  )
}
