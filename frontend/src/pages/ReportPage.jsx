import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import GradeBadge        from '../components/GradeBadge.jsx'
import QualityBadge      from '../components/QualityBadge.jsx'
import ConfidenceBar     from '../components/ConfidenceBar.jsx'
import EvidenceTable     from '../components/EvidenceTable.jsx'
import OverlayViewer     from '../components/OverlayViewer.jsx'
import SegmentationPanel from '../components/SegmentationPanel.jsx'
import { getReport }     from '../api.js'

const GRADE_COLORS = ['#16a34a','#65a30d','#d97706','#dc2626','#7c3aed']

export default function ReportPage() {
  const { reportId } = useParams()
  const nav = useNavigate()
  const [report, setReport] = useState(null)
  const [error,  setError]  = useState(null)

  useEffect(() => {
    getReport(reportId)
      .then(setReport)
      .catch(e => setError(e.message))
  }, [reportId])

  if (error) return (
    <main className="page-container">
      <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
        <span className="alert-icon">⚠</span> {error}
      </div>
      <Link to="/" className="btn btn-secondary">← Back to Upload</Link>
    </main>
  )

  if (!report) return (
    <main className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem' }} />
      <p>Loading report…</p>
    </main>
  )

  const { grade = {}, quality = {}, segmentation = {}, explainability = {}, images = {}, recommendation } = report
  const gradeColor = GRADE_COLORS[grade.icdr_grade] ?? '#9ca3af'

  return (
    <main className="page-container anim-fade">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => nav(-1)}>← Back</button>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Report: {reportId}
            </span>
          </div>
          <h1>Fundus Analysis Report</h1>
        </div>

        <button
          id="new-scan-btn"
          className="btn btn-primary"
          onClick={() => nav('/')}
        >
          + New Scan
        </button>
      </div>

      {/* ── Summary banner */}
      <div className="card anim-fade" style={{
        marginBottom: '1.5rem',
        borderColor: grade.referable ? 'rgba(220,38,38,0.25)' : gradeColor + '25',
        background: grade.referable ? 'rgba(220,38,38,0.03)' : 'rgba(22,163,74,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <GradeBadge
            grade={grade.icdr_grade}
            label={grade.icdr_label}
            referable={grade.referable}
            size="lg"
          />

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <QualityBadge label={quality.label} confidence={quality.confidence} />
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              {grade.icdr_description}
            </p>

            {/* Referable probability */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Referable DR probability:</span>
              <span className="mono" style={{ color: grade.referable ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                {grade.referable_probability != null
                  ? (grade.referable_probability * 100).toFixed(1) + '%'
                  : '—'
                }
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                (threshold ≥{grade.referable_threshold != null
                  ? (grade.referable_threshold * 100).toFixed(0) + '%)'
                  : '50%)'}
              </span>
            </div>
          </div>

          {/* Recommendation box */}
          <div style={{
            flex: '0 0 auto', maxWidth: 300,
            background: 'var(--bg-elevated)', borderRadius: 'var(--r-lg)',
            padding: '0.875rem 1rem', border: '1px solid var(--border-subtle)'
          }}>
            <h4 style={{ marginBottom: '0.5rem' }}>Recommendation</h4>
            <p style={{ fontSize: '0.825rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              {recommendation}
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-column layout */}
      <div className="grid-2" style={{ gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: images */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-icon cyan">🖼</div>
              <div>
                <h3>Fundus Image Views</h3>
                <p style={{ fontSize: '0.8rem' }}>Toggle between Original, Enhanced, Grad-CAM, and Fused overlay</p>
              </div>
            </div>
            <OverlayViewer images={{
              original:      images.original,
              enhanced:      images.enhanced,
              gradcam:       images.gradcam,
              fused_overlay: images.fused_overlay,
            }} />
          </div>

          {/* Segmentation */}
          <div className="card">
            <div className="card-header">
              <div className="card-icon violet">🔬</div>
              <div>
                <h3>Stage 2 — Retinal Structure Segmentation</h3>
                <p style={{ fontSize: '0.8rem' }}>Lesions · OD/Fovea · Vessel coverage · Density quadrants</p>
              </div>
            </div>
            <SegmentationPanel segmentation={segmentation} images={images} />
          </div>
        </div>

        {/* Right: scores + evidence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Grade probabilities */}
          <div className="card">
            <div className="card-header">
              <div className="card-icon cyan">📊</div>
              <div>
                <h3>Stage 3 — Grade Probabilities</h3>
                <p style={{ fontSize: '0.8rem' }}>CORAL ordinal head · Calibrated with temperature scaling</p>
              </div>
            </div>
            {Object.entries(grade.class_probabilities ?? {}).map(([label, prob], i) => (
              <ConfidenceBar
                key={label}
                label={`Grade ${i} — ${label}`}
                value={prob}
                color={GRADE_COLORS[i]}
              />
            ))}
          </div>

          {/* Quality breakdown */}
          <div className="card">
            <div className="card-header">
              <div className="card-icon green">✅</div>
              <div>
                <h3>Stage 1 — Quality Breakdown</h3>
                <p style={{ fontSize: '0.8rem' }}>EfficientNet-B0 · {quality.label}</p>
              </div>
            </div>
            {Object.entries(quality.probs ?? {}).map(([label, prob]) => (
              <ConfidenceBar
                key={label}
                label={label}
                value={prob}
                color={label === 'Good' ? '#16a34a' : label === 'Usable' ? '#d97706' : '#dc2626'}
              />
            ))}
          </div>

          {/* Evidence table */}
          <div className="card">
            <div className="card-header">
              <div className="card-icon amber">📋</div>
              <div>
                <h3>Stage 4 — Evidence Table</h3>
                <p style={{ fontSize: '0.8rem' }}>
                  {explainability.gradcam_note ?? 'Lesion findings mapped to ICDR criteria'}
                </p>
              </div>
            </div>
            <EvidenceTable rows={explainability.evidence_table ?? []} />
          </div>

          {/* Worklist link */}
          <Link to="/worklist" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
            View All Cases in Worklist →
          </Link>
        </div>
      </div>
    </main>
  )
}
