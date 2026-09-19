import type { Status } from '../api/local-operations.js';
import { CheckCircleIcon } from './Icons.js';
export function OperationalStatus({ status, bare = false }: { status: Status; bare?: boolean }) {
  const rows = [
    ['Collection', status.collection],
    ['Aggregation', status.aggregation],
    ['Configuration', status.configuration ?? 'healthy'],
    ['Data access', status.dataAccess]
  ];
  return (
    <section className={bare ? 'status-block' : 'detail-card'}>
      {bare ? (
        <h3 className="sub-heading">Operational status</h3>
      ) : (
        <>
          <p className="eyebrow">Live checks</p>
          <h2 className="icon-heading">
            <CheckCircleIcon size={20} />
            Operational status
          </h2>
        </>
      )}
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
