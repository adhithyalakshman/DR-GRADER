import { useState } from 'react'

const VIEWS = [
  { key: 'original',      label: 'Original' },
  { key: 'enhanced',      label: 'Enhanced' },
  { key: 'gradcam',       label: 'Grad-CAM' },
  { key: 'fused_overlay', label: 'Fused' },
]

export default function OverlayViewer({ images = {} }) {
  // Find the first available view
  const available = VIEWS.filter(v => images[v.key])
  const [active, setActive] = useState(available[0]?.key ?? 'original')

  const src = images[active]

  return (
    <div>
      {/* Toggle group */}
      <div className="toggle-group" style={{ marginBottom: '0.875rem', display: 'inline-flex' }}>
        {available.map(v => (
          <button
            key={v.key}
            id={`overlay-tab-${v.key}`}
            className={`toggle-btn ${active === v.key ? 'active' : ''}`}
            onClick={() => setActive(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Image panel */}
      <div className="image-panel" style={{ aspectRatio: '1', maxWidth: '100%' }}>
        {src ? (
          <img src={src} alt={active} />
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '0.875rem'
          }}>
            No image available
          </div>
        )}
        <span className="img-label">{available.find(v => v.key === active)?.label ?? active}</span>
      </div>

      {/* Legend for fused view */}
      {active === 'fused_overlay' && (
        <div style={{
          marginTop: '0.75rem',
          display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
          fontSize: '0.75rem', color: 'var(--text-muted)'
        }}>
          {[
            { color: '#ef4444', label: 'Microaneurysms' },
            { color: '#f59e0b', label: 'Hard Exudates' },
            { color: '#7c3aed', label: 'Haemorrhages' },
            { color: '#06b6d4', label: 'Cotton-Wool Spots' },
            { color: '#22c55e', label: 'Optic Disc' },
            { color: 'rgba(200,200,200,0.6)', label: 'Vessels' },
          ].map(item => (
            <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{
                width: 10, height: 10, borderRadius: 2,
                background: item.color, display: 'inline-block', flexShrink: 0
              }} />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {active === 'gradcam' && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Grad-CAM heatmap computed w.r.t. P(grade≥2) — highlights regions driving the referable-DR decision.
        </p>
      )}
    </div>
  )
}
