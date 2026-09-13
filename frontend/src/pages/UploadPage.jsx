import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import UploadZone   from '../components/UploadZone.jsx'
import QualityBadge from '../components/QualityBadge.jsx'
import ConfidenceBar from '../components/ConfidenceBar.jsx'
import { uploadImage, analyzeImage } from '../api.js'

const STAGE_LABELS = {
  idle:      null,
  uploading: 'Running Stage 1 — Quality Gate…',
  analyzing: 'Running Stage 2→3→4 — Segmentation + Grading + Grad-CAM…',
  done:      'Analysis complete!',
  error:     'Error',
}

export default function UploadPage() {
  const nav = useNavigate()

  const [stage, setStage]         = useState('idle')
  const [uploadResult, setUploadResult] = useState(null)
  const [previewUrl, setPreviewUrl]     = useState(null)
  const [error, setError]         = useState(null)

  // ── Handle file selection
  const handleFile = useCallback(async (file) => {
    setError(null)
    setUploadResult(null)
    setPreviewUrl(URL.createObjectURL(file))
    setStage('uploading')

    try {
      const res = await uploadImage(file)
      setUploadResult(res)
      setStage('idle')
    } catch (e) {
      setError(e.message)
      setStage('error')
    }
  }, [])

  // ── Trigger analysis
  const handleAnalyze = useCallback(async () => {
    if (!uploadResult?.image_id) return
    setError(null)
    setStage('analyzing')

    try {
      const res = await analyzeImage(uploadResult.image_id)
      nav(`/report/${res.report_id}`)
    } catch (e) {
      setError(e.message)
      setStage('error')
    }
  }, [uploadResult, nav])

  const isLoading = stage === 'uploading' || stage === 'analyzing'
  const isGradable = uploadResult?.status === 'gradable'
  const isRejected = uploadResult?.status === 'reject'

  return (
    <main className="page-container">
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }} className="anim-fade">
        <h1 style={{
          background: 'linear-gradient(135deg, #00d4ff, #3b82f6, #8b5cf6)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: '0.75rem'
        }}>
          DR Screening Pipeline
        </h1>
        <p style={{ maxWidth: 560, margin: '0 auto', fontSize: '1.05rem' }}>
          Upload a fundus photograph to instantly grade diabetic retinopathy severity
          with AI-powered quality control, lesion segmentation, and explainability.
        </p>

        {/* Pipeline stages indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem'
        }}>
          {[
            { n: 1, label: 'Quality Gate',    sub: 'EfficientNet-B0' },
            { n: 2, label: 'Segmentation',    sub: 'Lesions · OD · Vessels' },
            { n: 3, label: 'DR Grading',      sub: 'CORAL Ordinal' },
            { n: 4, label: 'Explainability',  sub: 'Grad-CAM + Overlay' },
          ].map((s, i) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '0.4rem 0.75rem',
                background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-subtle)'
              }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>Stage {s.n}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{s.sub}</span>
              </div>
              {i < 3 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: Upload + status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <UploadZone onFile={handleFile} disabled={isLoading} />

          {/* Loading state */}
          {isLoading && (
            <div className="card anim-fade" style={{ textAlign: 'center', padding: '1.5rem' }}>
              <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--accent-cyan)' }}>{STAGE_LABELS[stage]}</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="alert alert-danger anim-fade">
              <span className="alert-icon">⚠</span>
              <div>
                <strong>Error:</strong> {error}
                <br />
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => { setError(null); setStage('idle'); setUploadResult(null) }}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Quality result */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {previewUrl && (
            <div className="card anim-fade">
              <div className="card-header">
                <div className="card-icon cyan">📷</div>
                <div>
                  <h3>Uploaded Image</h3>
                  {uploadResult && (
                    <QualityBadge
                      label={uploadResult.quality_label}
                      confidence={uploadResult.confidence}
                    />
                  )}
                </div>
              </div>
              <div className="image-panel" style={{ aspectRatio: '1' }}>
                <img
                  src={
                    uploadResult?.enhanced_b64 ??
                    uploadResult?.original_b64 ??
                    previewUrl
                  }
                  alt="Uploaded fundus"
                />
                {uploadResult?.enhanced_b64 && (
                  <span className="img-label">Enhanced (CLAHE)</span>
                )}
              </div>
            </div>
          )}

          {/* Stage 1 result detail */}
          {uploadResult && (
            <div className="card anim-fade">
              <div className="card-header">
                <div className={`card-icon ${isRejected ? 'red' : 'green'}`}>
                  {isRejected ? '❌' : '✅'}
                </div>
                <div>
                  <h3>Stage 1 — Quality Gate</h3>
                  <p style={{ fontSize: '0.8rem' }}>EfficientNet-B0 · 3-class classifier</p>
                </div>
              </div>

              {/* Quality probability bars */}
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Quality Probabilities</h4>
                {Object.entries(uploadResult.probs ?? {}).map(([label, prob]) => (
                  <ConfidenceBar
                    key={label}
                    label={label}
                    value={prob}
                    color={
                      label === 'Good'   ? '#22c55e' :
                      label === 'Usable' ? '#f59e0b' : '#ef4444'
                    }
                  />
                ))}
              </div>

              {/* Pre-filter scores */}
              {uploadResult.pre_filters && (
                <div>
                  <h4 style={{ marginBottom: '0.6rem' }}>Classical Pre-Filters</h4>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div className="stat-card" style={{ flex: 1, minWidth: 100 }}>
                      <div className="stat-label">Blur Score</div>
                      <div className="stat-value" style={{
                        fontSize: '1.1rem',
                        color: uploadResult.blur_flag ? '#ef4444' : '#22c55e'
                      }}>
                        {uploadResult.pre_filters.blur_score?.toFixed(1)}
                      </div>
                      <div className="stat-sub">Laplacian Var</div>
                    </div>
                    <div className="stat-card" style={{ flex: 1, minWidth: 100 }}>
                      <div className="stat-label">Illumination</div>
                      <div className="stat-value" style={{
                        fontSize: '1.1rem',
                        color: uploadResult.illum_flag ? '#ef4444' : '#22c55e'
                      }}>
                        {uploadResult.pre_filters.illum_score?.toFixed(1)}
                      </div>
                      <div className="stat-sub">Histogram Spread</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="divider" />

              {/* Rejection reason or analyze button */}
              {isRejected ? (
                <div>
                  <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                    <span className="alert-icon">🔁</span>
                    <div>
                      <strong>Image Rejected</strong><br />
                      {uploadResult.rejection_reason}
                    </div>
                  </div>
                  <button
                    id="try-again-btn"
                    className="btn btn-secondary"
                    onClick={() => { setUploadResult(null); setPreviewUrl(null); setStage('idle') }}
                  >
                    Upload New Image
                  </button>
                </div>
              ) : (
                <div>
                  {uploadResult.quality_label === 'Usable' && (
                    <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                      <span className="alert-icon">✨</span>
                      CLAHE + illumination normalization applied. Analysis will use the enhanced image.
                    </div>
                  )}
                  <button
                    id="analyze-btn"
                    className="btn btn-primary btn-lg"
                    onClick={handleAnalyze}
                    disabled={isLoading}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {isLoading ? (
                      <><span className="spinner" /> Analyzing…</>
                    ) : (
                      '🔍 Run Full Analysis (Stages 2→3→4)'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
