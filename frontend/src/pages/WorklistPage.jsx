import { useEffect, useState } from 'react'
import WorklistTable from '../components/WorklistTable.jsx'
import { getWorklist } from '../api.js'

export default function WorklistPage() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  function load() {
    setLoading(true)
    getWorklist()
      .then(data => { setItems(data); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const referableCount    = items.filter(i => i.referable).length
  const nonReferableCount = items.filter(i => !i.referable).length

  return (
    <main className="page-container anim-fade">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Worklist</h1>
          <p>{items.length} case{items.length !== 1 ? 's' : ''} processed · sorted by urgency</p>
        </div>
        <button id="refresh-worklist-btn" className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? <><span className="spinner" /> Refreshing…</> : '↻ Refresh'}
        </button>
      </div>

      {/* Summary stats */}
      {items.length > 0 && (
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <div className="stat-label">Total Cases</div>
            <div className="stat-value">{items.length}</div>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
            <div className="stat-label" style={{ color: '#ef4444' }}>⚠ Referrable</div>
            <div className="stat-value" style={{ color: '#ef4444' }}>{referableCount}</div>
            <div className="stat-sub">Require ophthalmology</div>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
            <div className="stat-label" style={{ color: '#22c55e' }}>✓ Non-Referable</div>
            <div className="stat-value" style={{ color: '#22c55e' }}>{nonReferableCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg Grade</div>
            <div className="stat-value" style={{ fontSize: '1.1rem' }}>
              {items.length
                ? (items.reduce((s, i) => s + i.icdr_grade, 0) / items.length).toFixed(1)
                : '—'}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          <span className="alert-icon">⚠</span> {error}
        </div>
      )}

      {loading && !items.length ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <WorklistTable items={items} />
      )}
    </main>
  )
}
