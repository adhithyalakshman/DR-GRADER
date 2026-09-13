import { useState } from 'react'

export default function SegmentationPanel({ segmentation = {}, images = {} }) {
  const {
    lesion_counts = {},
    lesion_components = {},
    lesion_nearest_macula = {},
    od_detected,
    od_area_px,
    vessel_coverage,
    vessel_density_quadrants = {},
    macula_point,
    available,
  } = segmentation

  if (!available) {
    return (
      <div style={{
        padding: '1.5rem', textAlign: 'center',
        color: 'var(--text-muted)', fontSize: '0.85rem',
        background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)'
      }}>
        Segmentation not available — Stage 2 may have failed or the image was rejected.
      </div>
    )
  }

  const lesions = [
    { code: 'MA',  label: 'Microaneurysms',       color: '#dc2626', bgColor: 'rgba(220,38,38,0.06)' },
    { code: 'EX',  label: 'Hard Exudates',         color: '#d97706', bgColor: 'rgba(217,119,6,0.06)' },
    { code: 'HE',  label: 'Haemorrhages',          color: '#7c3aed', bgColor: 'rgba(124,58,237,0.06)' },
    { code: 'CWS', label: 'Cotton-Wool Spots',     color: '#0284c7', bgColor: 'rgba(2,132,199,0.06)' },
  ]

  // Vessel density quadrant color helper
  const densityColor = (val) => {
    if (val > 0.1) return '#16a34a'
    if (val > 0.05) return '#65a30d'
    if (val > 0.02) return '#d97706'
    return '#9ca3af'
  }
  const densityBg = (val) => {
    if (val > 0.1) return 'rgba(22,163,74,0.7)'
    if (val > 0.05) return 'rgba(101,163,13,0.6)'
    if (val > 0.02) return 'rgba(217,119,6,0.5)'
    return 'rgba(156,163,175,0.3)'
  }

  // Segmentation image tabs
  const segViews = [
    { key: 'fused_segmentation', label: 'All Layers' },
    { key: 'vessel_overlay',     label: 'Vessels' },
    { key: 'od_overlay',         label: 'OD / Macula' },
    { key: 'lesion_ma_overlay',  label: 'MA' },
    { key: 'lesion_ex_overlay',  label: 'EX' },
    { key: 'lesion_he_overlay',  label: 'HE' },
    { key: 'lesion_cws_overlay', label: 'CWS' },
  ].filter(v => images[v.key])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── Lesion detail table ── */}
      <div>
        <h4 style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>Lesion Analysis</h4>
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Pixel Count</th>
              <th>Clusters</th>
              <th>Nearest to Macula</th>
            </tr>
          </thead>
          <tbody>
            {lesions.map(l => {
              const count = lesion_counts[l.code] ?? 0
              const comps = lesion_components[l.code] ?? 0
              const nearest = lesion_nearest_macula[l.code]
              return (
                <tr key={l.code}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="lesion-swatch" style={{ background: l.color }} />
                      <span style={{ fontWeight: 600, color: count > 0 ? l.color : 'var(--text-muted)' }}>
                        {l.code}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.label}</span>
                    </div>
                  </td>
                  <td>
                    <span className="mono" style={{ color: count > 0 ? l.color : 'var(--text-muted)' }}>
                      {count > 0 ? count.toLocaleString() : '—'}
                    </span>
                  </td>
                  <td>
                    <span className="mono" style={{ color: comps > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {comps > 0 ? comps : '—'}
                    </span>
                  </td>
                  <td>
                    <span className="mono" style={{ color: nearest != null ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {nearest != null ? `${nearest} px` : '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── OD + Vessel summary row ── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Optic Disc */}
        <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
          <div className="stat-label">Optic Disc</div>
          <div className="stat-value" style={{
            fontSize: '1rem',
            color: od_detected ? '#16a34a' : 'var(--text-muted)'
          }}>
            {od_detected ? '✓ Detected' : 'Not detected'}
          </div>
          {od_detected && od_area_px > 0 && (
            <div className="stat-sub">{od_area_px.toLocaleString()} px area</div>
          )}
        </div>

        {/* Macula */}
        <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
          <div className="stat-label">Macula / Fovea</div>
          <div className="stat-value" style={{
            fontSize: '1rem',
            color: macula_point ? '#16a34a' : 'var(--text-muted)'
          }}>
            {macula_point ? '✓ Located' : 'Not found'}
          </div>
          {macula_point && (
            <div className="stat-sub">
              ({macula_point[0]}, {macula_point[1]}) canonical
            </div>
          )}
        </div>

        {/* Vessel Coverage */}
        <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
          <div className="stat-label">Vessel Coverage</div>
          <div className="stat-value" style={{ fontSize: '1rem' }}>
            {vessel_coverage != null ? `${(vessel_coverage * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="stat-sub">of canonical frame</div>
        </div>
      </div>

      {/* ── Vessel density quadrant grid ── */}
      {Object.keys(vessel_density_quadrants).length > 0 && (
        <div>
          <h4 style={{ marginBottom: '0.6rem', fontSize: '0.8rem' }}>Vessel Density by Quadrant</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="vessel-quadrant-grid">
              {['TL', 'TR', 'BL', 'BR'].map(q => {
                const val = vessel_density_quadrants[q] ?? 0
                return (
                  <div
                    key={q}
                    className="vessel-quadrant-cell"
                    style={{ background: densityBg(val) }}
                    title={`${q}: ${(val * 100).toFixed(1)}%`}
                  >
                    {(val * 100).toFixed(1)}%
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div><strong>TL</strong> = Top-Left &nbsp; <strong>TR</strong> = Top-Right</div>
              <div><strong>BL</strong> = Bottom-Left &nbsp; <strong>BR</strong> = Bottom-Right</div>
              <div style={{ marginTop: '0.3rem' }}>
                Fraction of each quadrant covered by detected vessels.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Segmentation overlay images ── */}
      {segViews.length > 0 && (
        <div>
          <h4 style={{ marginBottom: '0.6rem', fontSize: '0.8rem' }}>Segmentation Overlays</h4>
          <SegImageViewer views={segViews} images={images} />
        </div>
      )}
    </div>
  )
}

/** Inline mini-viewer for segmentation overlay images */

function SegImageViewer({ views, images }) {
  const [active, setActive] = useState(views[0]?.key ?? '')

  const src = images[active]

  return (
    <div>
      <div className="toggle-group" style={{ marginBottom: '0.75rem', display: 'inline-flex', flexWrap: 'wrap' }}>
        {views.map(v => (
          <button
            key={v.key}
            className={`toggle-btn ${active === v.key ? 'active' : ''}`}
            onClick={() => setActive(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="image-panel" style={{ aspectRatio: '1', maxWidth: '100%' }}>
        {src ? (
          <img src={src} alt={active} />
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '0.875rem'
          }}>
            No overlay available
          </div>
        )}
        <span className="img-label">{views.find(v => v.key === active)?.label ?? active}</span>
      </div>

      {/* Legend */}
      <div style={{
        marginTop: '0.5rem',
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        fontSize: '0.72rem', color: 'var(--text-muted)'
      }}>
        {[
          { color: '#dc2626', label: 'MA — Microaneurysms' },
          { color: '#d97706', label: 'EX — Exudates' },
          { color: '#7c3aed', label: 'HE — Haemorrhages' },
          { color: '#0284c7', label: 'CWS — Cotton-Wool' },
          { color: '#00cccc', label: 'Optic Disc' },
          { color: '#ffcc00', label: 'Macula' },
          { color: 'rgba(255,80,80,0.7)', label: 'Vessels' },
        ].map(item => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: item.color, display: 'inline-block', flexShrink: 0
            }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
