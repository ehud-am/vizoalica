import { useEffect, useState } from 'react';
import { getBackendState, type BackendState } from '../api/local-operations.js';

const STATUS_TEXT: Record<string, string> = {
  current: 'Up to date',
  'update-available': 'Update available',
  'console-older': 'Console is older',
  unknown: 'Unknown',
  unsupported: 'Unsupported'
};

function Row({
  label,
  current,
  status,
  message
}: {
  label: string;
  current: string;
  status: string;
  message: string;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{current}</td>
      <td>
        <span className={`status-pill status-${status}`}>
          <span aria-hidden="true">
            {status === 'current' ? '✓' : status === 'unknown' ? '?' : '●'}{' '}
          </span>
          {STATUS_TEXT[status] ?? status}
        </span>
      </td>
      <td>{message}</td>
    </tr>
  );
}

/**
 * The backend's versions and health: the first section of Health. It covers the whole environment,
 * whichever project is chosen, and only reads; nothing here changes the backend.
 */
export function BackendSection({ environment }: { environment?: string }) {
  const [state, setState] = useState<BackendState | undefined>();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getBackendState()
      .then((result) => !cancelled && setState(result))
      .catch(() => !cancelled && setError('The backend could not be reached.'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="health-backend" aria-labelledby="backend-heading" data-section="backend">
      <h2 id="backend-heading">Backend</h2>
      <p className="hint">
        Covers the whole environment{environment ? ` (${environment})` : ''}, whichever project is
        chosen.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!state && !error && (
        <p className="metric-empty" aria-busy="true">
          Checking…
        </p>
      )}
      {state && (
        <>
          <div className="panel">
            <h3 id="versions-heading">Versions</h3>
            <table className="versions-table" aria-labelledby="versions-heading">
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="Console"
                  current={state.consoleVersion}
                  status="current"
                  message="This installed console."
                />
                <Row
                  label="Worker"
                  current={state.workerVersion ?? 'unknown'}
                  status={state.worker.status}
                  message={state.worker.message}
                />
                <Row
                  label="Database schema"
                  current={state.schema.applied === null ? 'unknown' : String(state.schema.applied)}
                  status={state.schemaStatus.status}
                  message={state.schemaStatus.message}
                />
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h3 id="storage-heading">Storage</h3>
            <dl className="detail-list" aria-labelledby="storage-heading">
              <div>
                <dt>Database</dt>
                <dd>{state.health?.database ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>{state.health?.storage ?? 'unknown'}</dd>
              </div>
            </dl>
          </div>
        </>
      )}
    </section>
  );
}
