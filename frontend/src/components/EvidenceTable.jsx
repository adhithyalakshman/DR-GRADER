export default function EvidenceTable({ rows = [] }) {
  if (!rows.length) return null

  return (
    <div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Lesion Type</th>
            <th>Count</th>
            <th>ICDR Criterion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.code}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    className="lesion-swatch"
                    style={{ background: row.color }}
                  />
                  <span className="highlight">{row.lesion}</span>
                </div>
              </td>
              <td>
                <span className="mono" style={{ color: row.count > 0 ? row.color : 'var(--text-muted)' }}>
                  {row.count > 0 ? row.count : '—'}
                </span>
              </td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {row.icdr_criterion}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
