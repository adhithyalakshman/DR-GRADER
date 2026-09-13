const QUALITY_CONFIG = {
  Good:   { icon: '✅', cls: 'badge-green',  dot: 'green',  label: 'Good Quality' },
  Usable: { icon: '⚠️', cls: 'badge-amber',  dot: 'amber',  label: 'Usable (Enhanced)' },
  Reject: { icon: '❌', cls: 'badge-red',    dot: 'red',    label: 'Rejected' },
}

export default function QualityBadge({ label, confidence }) {
  const cfg = QUALITY_CONFIG[label] ?? QUALITY_CONFIG['Reject']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span className={`badge ${cfg.cls}`}>
        {cfg.icon} {cfg.label}
      </span>
      {confidence != null && (
        <span className="mono" style={{ fontSize: '0.78rem', opacity: 0.7 }}>
          {(confidence * 100).toFixed(1)}%
        </span>
      )}
    </div>
  )
}
