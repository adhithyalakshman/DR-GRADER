const GRADE_CONFIG = {
  0: { color: '#16a34a', bg: 'rgba(22,163,74,0.06)',   border: 'rgba(22,163,74,0.25)',   label: 'No DR',              icon: '🟢' },
  1: { color: '#65a30d', bg: 'rgba(101,163,13,0.06)',  border: 'rgba(101,163,13,0.25)',  label: 'Mild NPDR',          icon: '🟡' },
  2: { color: '#d97706', bg: 'rgba(217,119,6,0.06)',   border: 'rgba(217,119,6,0.25)',   label: 'Moderate NPDR',      icon: '🟠' },
  3: { color: '#dc2626', bg: 'rgba(220,38,38,0.06)',   border: 'rgba(220,38,38,0.25)',   label: 'Severe NPDR',        icon: '🔴' },
  4: { color: '#7c3aed', bg: 'rgba(124,58,237,0.06)',  border: 'rgba(124,58,237,0.25)',  label: 'Proliferative DR',   icon: '🟣' },
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
          boxShadow: `0 0 ${isLg ? 16 : 8}px ${cfg.border}`,
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
