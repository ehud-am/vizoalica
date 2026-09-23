import { useEffect, useState } from 'react';
import {
  getBackendState,
  purgeDeleted,
  rotateBackendSecret,
  type BackendState,
  type PurgeSummary
} from '../api/local-operations.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { CopyButton } from '../components/CopyButton.js';
import { PageHeader } from '../components/PageHeader.js';
import { DeployWizard } from './DeployWizard.js';
import { UpdatePanel } from './UpdatePanel.js';
import { useSetup } from '../setup/SetupProvider.js';

const STATUS_TEXT: Record<string, string> = {
  current: 'Up to date',
  'update-available': 'Update available',
  'console-older': 'Console is older',
  unknown: 'Unknown',
  unsupported: 'Unsupported'
};

const SECRET_LABEL: Record<'admin' | 'token' | 'digest', string> = {
  admin: 'Administrator secret',
  token: 'Website token-signing secret',
  digest: 'Analytics digest secret'
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

function RotatePanel() {
  const [rotating, setRotating] = useState<'admin' | 'token' | 'digest' | undefined>();
  const [revealed, setRevealed] = useState<{ kind: string; value: string } | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirmRotate() {
    if (!rotating) return;
    setBusy(true);
    setError('');
    try {
      const result = await rotateBackendSecret(rotating);
      setRevealed(result);
      setRotating(undefined);
    } catch {
      setError('That secret could not be rotated. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="rotate-heading">
      <h2 id="rotate-heading">Rotate a secret</h2>
      <p>Replaces one secret on the Worker; the new value is shown once.</p>
      <div className="form-actions">
        {(['admin', 'token', 'digest'] as const).map((kind) => (
          <button key={kind} type="button" className="secondary" onClick={() => setRotating(kind)}>
            Rotate {SECRET_LABEL[kind].toLowerCase()}
          </button>
        ))}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {revealed && (
        <p role="status">
          New {SECRET_LABEL[revealed.kind as 'admin' | 'token' | 'digest']}:{' '}
          <code>{revealed.value}</code> <CopyButton text={revealed.value} what="the new secret" />
        </p>
      )}
      {rotating && (
        <ConfirmDialog
          title={`Rotate the ${SECRET_LABEL[rotating].toLowerCase()}?`}
          confirmLabel="Rotate"
          busy={busy}
          onConfirm={() => void confirmRotate()}
          onCancel={() => setRotating(undefined)}
        >
          <p>
            {rotating === 'admin' &&
              'Every operator console stops working with the old value until it is given the new one.'}
            {rotating === 'token' &&
              "Every website's token endpoint must be given the new value, or visitors' events are rejected until it is."}
            {rotating === 'digest' &&
              'Unique-visitor counts restart: visitors seen before this change count as new once more.'}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function PurgePanel() {
  const [confirming, setConfirming] = useState(false);
  const [summary, setSummary] = useState<PurgeSummary | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function dryRun() {
    setBusy(true);
    setError('');
    try {
      setSummary(await purgeDeleted(false));
    } catch {
      setError('The purge preview could not be run. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError('');
    try {
      setSummary(await purgeDeleted(true));
      setConfirming(false);
    } catch {
      setError('The purge did not complete. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="purge-heading">
      <h2 id="purge-heading">Purge deleted data</h2>
      <p>Permanently removes data for projects and websites already deleted.</p>
      <div className="form-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => void dryRun()}>
          Preview
        </button>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          Purge now
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {summary && (
        <p role="status">
          {summary.dryRun ? 'Would remove' : 'Removed'} {summary.objects} stored object
          {summary.objects === 1 ? '' : 's'}
          {summary.complete ? '' : ' (partial; run again to continue)'}.
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title="Purge deleted data now?"
          confirmLabel="Purge"
          busy={busy}
          onConfirm={() => void apply()}
          onCancel={() => setConfirming(false)}
        >
          <p>This permanently removes stored data for already-deleted projects and websites.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** Read-only for every role except the admin, who also deploys, rotates, and purges. */
export function BackendPage({ onDeployed }: { onDeployed: () => void }) {
  const { state: setupState } = useSetup();
  const [state, setState] = useState<BackendState | undefined>();
  const [error, setError] = useState('');
  const isAdmin = setupState?.principal?.role === 'admin';
  const notConnected = setupState?.connection.status === 'none';

  useEffect(() => {
    if (notConnected) return;
    let cancelled = false;
    getBackendState()
      .then((result) => !cancelled && setState(result))
      .catch(() => !cancelled && setError('The backend could not be reached.'));
    return () => {
      cancelled = true;
    };
  }, [notConnected]);

  function refresh() {
    getBackendState()
      .then(setState)
      .catch(() => setError('The backend could not be reached.'));
  }

  return (
    <div className="page backend-page" data-page="backend">
      <PageHeader
        crumbs={[{ label: 'Backend' }]}
        title="Backend"
        description="The three versions this console cares about, and the backend's health."
      />
      {notConnected && isAdmin && <DeployWizard onDeployed={onDeployed} />}
      {notConnected && !isAdmin && (
        <p className="notice" role="status">
          No backend is connected yet. Only an admin can deploy or connect one.
        </p>
      )}
      {!notConnected && error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!notConnected && state && (
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
          {isAdmin ? (
            <>
              <UpdatePanel onUpdated={refresh} />
              <RotatePanel />
              <PurgePanel />
            </>
          ) : (
            <p className="hint">Only an admin can change the backend.</p>
          )}
        </>
      )}
    </div>
  );
}
