import { useEffect, useState } from 'react';
import { getBackendState, type BackendState } from '../api/local-operations.js';
import { PageHeader } from '../components/PageHeader.js';

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

/** The backend's versions and health, for every role. It only reads; nothing here changes the backend. */
export function BackendPage() {
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
    <div className="page backend-page" data-page="backend">
      <PageHeader
        crumbs={[{ label: 'Backend' }]}
        title="Backend"
        description="The three versions this console cares about, and the backend's health."
      />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {state && (
        <>
          <section className="panel" aria-labelledby="versions-heading">
            <h2 id="versions-heading">Versions</h2>
            <table className="versions-table">
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
          </section>
          <section className="panel" aria-labelledby="health-heading">
            <h2 id="health-heading">Health</h2>
            <dl className="detail-list">
              <div>
                <dt>Database</dt>
                <dd>{state.health?.database ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>{state.health?.storage ?? 'unknown'}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
