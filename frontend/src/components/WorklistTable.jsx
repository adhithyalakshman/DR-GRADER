import { useNavigate } from 'react-router-dom'

const GRADE_COLORS = ['#22c55e','#84cc16','#f59e0b','#ef4444','#7c3aed']

export default function WorklistTable({ items = [] }) {
  const nav = useNavigate()

  if (!items.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <h3>No cases processed yet</h3>
        <p>Upload and analyse fundus images to see them here.</p>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            <th>Report ID</th>
            <th>Quality</th>
            <th>ICDR Grade</th>
            <th>P(Referable)</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const color = GRADE_COLORS[item.icdr_grade] ?? '#8ba3cc'
            return (
              <tr key={item.report_id}>
                <td style={{ width: 4, padding: 0 }}>
                  <div
                    className="urgency-bar"
                    style={{ background: item.referable ? '#ef4444' : color }}
                  />
                </td>
                <td>
                  <span className="mono" style={{ fontSize: '0.72rem' }}>
                    {item.report_id.slice(0, 8)}…
                  </span>
                </td>
                <td>
                  <span className={`badge ${
                    item.quality === 'Good'   ? 'badge-green' :
                    item.quality === 'Usable' ? 'badge-amber' : 'badge-red'
                  }`}>
                    {item.quality}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      display: 'inline-block', width: 8, height: 8,
                      borderRadius: '50%', background: color, flexShrink: 0
                    }} />
                    <span style={{ color, fontWeight: 600 }}>
                      Grade {item.icdr_grade}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {item.icdr_label}
                    </span>
                  </div>
                </td>
                <td>
                  <span className="mono" style={{ color: item.referable ? '#ef4444' : 'var(--text-secondary)' }}>
                    {(item.ref_prob * 100).toFixed(1)}%
                  </span>
                  {item.referable && (
                    <span className="badge badge-red" style={{ marginLeft: '0.4rem', fontSize: '0.68rem' }}>
                      REFER
                    </span>
                  )}
                </td>
                <td>
                  <span className="badge badge-cyan">{item.status}</span>
                </td>
                <td>
                  <button
                    id={`worklist-view-${item.report_id.slice(0,8)}`}
                    className="btn btn-secondary btn-sm"
                    onClick={() => nav(`/report/${item.report_id}`)}
                  >
                    View Report →
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
