export default function SegmentationPanel({ segmentation = {} }) {
  const { lesion_counts = {}, od_detected, vessel_coverage, available } = segmentation

  if (!available) {
    return (
      <div style={{
        padding: '1.5rem', textAlign: 'center',
        color: 'var(--text-muted)', fontSize: '0.85rem',
        background: 'var(--bg-glass)', borderRadius: 'var(--r-md)'
      }}>
        Segmentation not available — Stage 2 may have failed or the image was rejected.
      </div>
    )
  }

  const lesions = [
    { code: 'MA',  label: 'Microaneurysms',       color: '#ef4444' },
    { code: 'EX',  label: 'Hard Exudates',         color: '#f59e0b' },
    { code: 'HE',  label: 'Haemorrhages',          color: '#7c3aed' },
    { code: 'CWS', label: 'Cotton-Wool Spots',     color: '#06b6d4' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Lesion counts */}
      <div className="grid-4" style={{ gap: '0.6rem' }}>
        {lesions.map(l => {
          const count = lesion_counts[l.code] ?? 0
          return (
            <div key={l.code} className="stat-card" style={{
              borderColor: count > 0 ? l.color + '40' : 'var(--border-subtle)'
            }}>
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="lesion-swatch" style={{ background: l.color }} />
                {l.code}
              </div>
              <div className="stat-value" style={{ color: count > 0 ? l.color : 'var(--text-muted)' }}>
                {count > 0 ? count.toLocaleString() : '—'}
              </div>
              <div className="stat-sub">{l.label}</div>
            </div>
          )
        })}
      </div>

      {/* OD + vessel summary */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-label">Optic Disc</div>
          <div className="stat-value" style={{ fontSize: '1rem', color: od_detected ? '#22c55e' : 'var(--text-muted)' }}>
            {od_detected ? '✓ Detected' : 'Not detected'}
          </div>
        </div>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-label">Vessel Coverage</div>
          <div className="stat-value" style={{ fontSize: '1rem' }}>
            {vessel_coverage != null ? `${(vessel_coverage * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="stat-sub">of canonical frame</div>
        </div>
      </div>
    </div>
  )
}
