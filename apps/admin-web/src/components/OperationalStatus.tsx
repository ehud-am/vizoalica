import type { Status } from '../api/local-operations.js';
export function OperationalStatus({ status }: { status: Status }) {
  const rows = [
    ['Collection', status.collection],
    ['Aggregation', status.aggregation],
    ['Configuration', status.configuration ?? 'healthy'],
    ['Data access', status.dataAccess]
  ];
  return (
    <section className="detail-card">
      <p className="eyebrow">Live checks</p>
      <h2>Operational status</h2>
      <dl className="health-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <span className={`health-dot ${value}`} aria-hidden="true" />
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
