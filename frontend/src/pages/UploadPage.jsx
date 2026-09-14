import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PatientForm  from '../components/PatientForm.jsx'
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

  // Step 1 = patient form, Step 2 = upload & analyze
  const [step, setStep] = useState(1)
  const [patientInfo, setPatientInfo] = useState(null)

  const [stage, setStage]         = useState('idle')
  const [uploadResult, setUploadResult] = useState(null)
  const [previewUrl, setPreviewUrl]     = useState(null)
  const [error, setError]         = useState(null)

  // ── Handle patient form submission
  const handlePatientSubmit = useCallback((data) => {
    setPatientInfo(data)
    setStep(2)
  }, [])

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
      // Store patient info in localStorage keyed by report_id
      if (patientInfo) {
        localStorage.setItem(`patient_${res.report_id}`, JSON.stringify(patientInfo))
      }
      nav(`/report/${res.report_id}`)
    } catch (e) {
      setError(e.message)
      setStage('error')
    }
  }, [uploadResult, nav, patientInfo])

  const isLoading = stage === 'uploading' || stage === 'analyzing'
  const isGradable = uploadResult?.status === 'gradable'
  const isRejected = uploadResult?.status === 'reject'

  return (
    <main className="page-container">
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }} className="anim-fade">
        <h1 style={{
          background: 'linear-gradient(135deg, #0284c7, #2563eb, #7c3aed)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: '0.75rem'
        }}>
          DR Screening Pipeline
        </h1>
        <p style={{ maxWidth: 560, margin: '0 auto', fontSize: '1.05rem' }}>
          Upload a fundus photograph to instantly grade diabetic retinopathy severity
          with AI-powered quality control, lesion segmentation, and explainability.
        </p>

        {/* Step indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '0.75rem', marginTop: '1.5rem', fontSize: '0.85rem'
        }}>
          {[
            { n: 1, label: 'Patient Details', icon: '🏥' },
            { n: 2, label: 'Upload & Analyze', icon: '📷' },
          ].map((s, i) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: step === s.n ? 'var(--accent-glow)' : 'var(--bg-card)',
                  borderRadius: 'var(--r-md)',
                  border: step === s.n
                    ? '1.5px solid var(--accent-cyan)'
                    : '1px solid var(--border-subtle)',
                  boxShadow: step === s.n ? '0 2px 8px rgba(2,132,199,0.1)' : 'var(--shadow-card)',
                  cursor: step > s.n ? 'pointer' : 'default',
                  opacity: step >= s.n ? 1 : 0.5,
                  transition: 'all 0.2s ease',
                }}
                onClick={() => { if (step > s.n) setStep(s.n) }}
              >
                <span style={{ fontSize: '1.1rem' }}>{s.icon}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{
                    fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase',
                    color: step === s.n ? 'var(--accent-cyan)' : 'var(--text-muted)',
                    letterSpacing: '0.05em'
                  }}>
                    Step {s.n}
                  </div>
                  <div style={{
                    fontWeight: 600,
                    color: step === s.n ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}>
                    {s.label}
                  </div>
                </div>
                {step > s.n && (
                  <span style={{ color: 'var(--grade-0)', fontWeight: 700, fontSize: '1rem' }}>✓</span>
                )}
              </div>
              {i < 1 && <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>→</span>}
            </div>
          ))}
        </div>

        {/* Pipeline stages (shown on step 2) */}
        {step === 2 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap', fontSize: '0.8rem'
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
                  background: 'var(--bg-card)', borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>Stage {s.n}</span>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{s.label}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{s.sub}</span>
                </div>
                {i < 3 && <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>→</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* STEP 1: Patient Details Form                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <PatientForm onSubmit={handlePatientSubmit} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* STEP 2: Upload & Analyze                              */}
      {/* ═══════════════════════════════════════════════════════ */}
      {step === 2 && (
        <>
          {/* Patient info summary bar */}
          {patientInfo && (
            <div className="card anim-fade" style={{ marginBottom: '1.5rem', padding: '0.75rem 1.25rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.2rem' }}>👤</span>
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {patientInfo.patientName}
                    </span>
                    <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.75rem' }}>
                      ID: {patientInfo.patientId}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {patientInfo.age}y · {patientInfo.gender} · DM {patientInfo.diabetesDuration}yr
                    {patientInfo.hba1c ? ` · HbA1c ${patientInfo.hba1c}%` : ''}
                  </span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setStep(1)}
                  style={{ fontSize: '0.75rem' }}
                >
                  ✏️ Edit Details
                </button>
              </div>
            </div>
          )}

          <div className="grid-2" style={{ gap: '1.5rem', alignItems: 'start' }}>
            {/* Left: Upload + status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <UploadZone onFile={handleFile} disabled={isLoading} />

              {/* Loading state */}
              {isLoading && (
                <div className="card anim-fade" style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem' }} />
                  <p style={{ color: 'var(--accent-cyan)', fontWeight: 500 }}>{STAGE_LABELS[stage]}</p>
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
                          label === 'Good'   ? '#16a34a' :
                          label === 'Usable' ? '#d97706' : '#dc2626'
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
                            color: uploadResult.blur_flag ? '#dc2626' : '#16a34a'
                          }}>
                            {uploadResult.pre_filters.blur_score?.toFixed(1)}
                          </div>
                          <div className="stat-sub">Laplacian Var</div>
                        </div>
                        <div className="stat-card" style={{ flex: 1, minWidth: 100 }}>
                          <div className="stat-label">Illumination</div>
                          <div className="stat-value" style={{
                            fontSize: '1.1rem',
                            color: uploadResult.illum_flag ? '#dc2626' : '#16a34a'
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
        </>
      )}
    </main>
  )
}
