const GRADE_CONFIG = {
  0: { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.35)',   label: 'No DR',              icon: '🟢' },
  1: { color: '#84cc16', bg: 'rgba(132,204,22,0.08)',  border: 'rgba(132,204,22,0.35)',  label: 'Mild NPDR',          icon: '🟡' },
  2: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.35)',  label: 'Moderate NPDR',      icon: '🟠' },
  3: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.35)',   label: 'Severe NPDR',        icon: '🔴' },
  4: { color: '#7c3aed', bg: 'rgba(124,58,237,0.08)',  border: 'rgba(124,58,237,0.35)',  label: 'Proliferative DR',   icon: '🟣' },
}

export default function GradeBadge({ grade, label, referable, size = 'md' }) {
  const cfg = GRADE_CONFIG[grade] ?? GRADE_CONFIG[0]
  const isLg = size === 'lg'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: isLg ? '1rem' : '0.6rem' }}>
      {/* Grade ring */}
      <div
        className="grade-ring"
        style={{
          width:  isLg ? 88 : 56,
          height: isLg ? 88 : 56,
          fontSize: isLg ? '2rem' : '1.25rem',
          borderColor: cfg.color,
          color: cfg.color,
          background: cfg.bg,
          boxShadow: `0 0 ${isLg ? 24 : 12}px ${cfg.border}`,
        }}
      >
        {grade}
      </div>

      <div>
        <div style={{ fontWeight: 700, fontSize: isLg ? '1.2rem' : '0.95rem', color: cfg.color }}>
          {label}
        </div>
        {referable != null && (
          <div style={{ marginTop: '0.2rem' }}>
            {referable ? (
              <span className="badge badge-red" style={{ fontSize: '0.72rem' }}>
                ⚠ Referable DR
              </span>
            ) : (
              <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>
                ✓ Non-Referable
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
