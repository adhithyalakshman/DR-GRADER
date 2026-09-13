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

      {/* Grad-CAM legend with color scale */}
      {active === 'gradcam' && (
        <div style={{ marginTop: '0.75rem' }}>
          <div className="gradcam-legend">
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Activation:</span>
            <span style={{ color: 'var(--text-muted)' }}>Low</span>
            <div className="gradcam-legend-bar" />
            <span style={{ color: 'var(--text-muted)' }}>High</span>
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Grad-CAM heatmap computed w.r.t. P(grade≥2) — highlights regions driving the referable-DR decision.
            <br/>
            <strong>Red/Yellow</strong> = high activation (model focuses here) &nbsp;|&nbsp;
            <strong>Blue/Green</strong> = low activation
          </p>
        </div>
      )}

      {/* Legend for fused view */}
      {active === 'fused_overlay' && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.6rem',
            fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem'
          }}>
            {[
              { color: '#dc2626', label: 'Microaneurysms' },
              { color: '#d97706', label: 'Hard Exudates' },
              { color: '#7c3aed', label: 'Haemorrhages' },
              { color: '#0284c7', label: 'Cotton-Wool Spots' },
              { color: '#16a34a', label: 'Optic Disc' },
              { color: '#eab308', label: 'Macula ✕' },
              { color: 'rgba(200,200,200,0.7)', label: 'Vessels' },
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
          {/* Grad-CAM scale in fused view */}
          <div className="gradcam-legend" style={{ marginTop: '0.25rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Grad-CAM:</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Low</span>
            <div className="gradcam-legend-bar" style={{ width: 80, height: 10 }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>High</span>
          </div>
        </div>
      )}
    </div>
  )
}
