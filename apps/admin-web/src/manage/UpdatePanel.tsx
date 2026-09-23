import { useEffect, useRef, useState } from 'react';
import {
  createUpdatePlan,
  getDeployRun,
  getUpdatePreview,
  resumeUpdateRun,
  startUpdateRun,
  type DeployPlan,
  type DeployRun,
  type PendingMigration,
  type UpdateComponent
} from '../api/local-operations.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';

const POLL_MS = 1500;

function componentLine(component: UpdateComponent): string {
  const from =
    component.current ?? (component.applied === null ? 'unknown' : String(component.applied));
  return `${from} → ${component.expected}`;
}

/**
 * The admin's update flow for the active environment's backend: a plan (Worker and schema from/to,
 * every pending migration) shown before anything runs, an optional decline of the backup for a purely
 * additive change, live step progress, and a failed step's resume. Read-only for every other role
 * (they never see this panel at all — the caller renders it only for an admin).
 */
export function UpdatePanel({ onUpdated }: { onUpdated: () => void }) {
  const [upToDate, setUpToDate] = useState<boolean | undefined>();
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<
    | (DeployPlan & {
        update: { worker: UpdateComponent; schema: UpdateComponent; pending: PendingMigration[] };
      })
    | undefined
  >();
  const [run, setRun] = useState<DeployRun | undefined>();
  const [skipBackup, setSkipBackup] = useState(false);
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    getUpdatePreview()
      .then((preview) => setUpToDate(preview.upToDate))
      .catch(() => setError('The update preview could not be read. Try again.'));
  }, []);

  useEffect(() => () => clearInterval(timer.current), []);

  function poll(runId: string) {
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      void getDeployRun(runId).then((next) => {
        setRun(next);
        if (next.status !== 'running') {
          clearInterval(timer.current);
          if (next.status === 'done') onUpdated();
        }
      });
    }, POLL_MS);
  }

  async function makePlan() {
    setBusy(true);
    setError('');
    try {
      setPlan(await createUpdatePlan());
    } catch {
      setError('The update plan could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function approve(confirmSkip = false) {
    if (!plan) return;
    const nonAdditivePending = plan.update.pending.some((migration) => migration.nonAdditive);
    if (skipBackup && nonAdditivePending) {
      setError('A pending change is not purely additive, so declining the backup is refused.');
      return;
    }
    if (skipBackup && !confirmSkip) {
      setConfirmingSkip(true);
      return;
    }
    setConfirmingSkip(false);
    setBusy(true);
    setError('');
    try {
      const started = await startUpdateRun(plan.id, skipBackup);
      setRun(started);
      if (started.status === 'running') poll(started.id);
    } catch {
      setError('The update could not be started. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    if (!run) return;
    setBusy(true);
    try {
      const resumed = await resumeUpdateRun(run.id);
      setRun(resumed);
      poll(resumed.id);
    } catch {
      setError('The update could not be resumed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (upToDate === undefined && !error) return null;
  if (upToDate === true && !run) return null;

  if (run)
    return (
      <section className="panel" aria-labelledby="update-progress-heading">
        <h2 id="update-progress-heading">
          {run.status === 'done' ? 'Updated' : run.status === 'failed' ? 'Stopped' : 'Updating…'}
        </h2>
        <ol className="steps update-steps" aria-live="polite">
          {run.steps.map((step) => (
            <li key={step.id} data-status={step.status}>
              <span aria-hidden="true">
                {step.status === 'done'
                  ? '✓'
                  : step.status === 'failed'
                    ? '✕'
                    : step.status === 'running'
                      ? '…'
                      : step.status === 'skipped'
                        ? '·'
                        : '·'}
              </span>{' '}
              {step.label}
              {step.status === 'failed' && step.error && (
                <p className="notice error" role="alert">
                  {step.error}
                </p>
              )}
            </li>
          ))}
        </ol>
        {run.status === 'failed' && (
          <div className="form-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void resume()}>
              Resume
            </button>
          </div>
        )}
        {run.status === 'done' && (
          <p role="status">
            Now at Worker <strong>{run.versions?.after.worker ?? 'unknown'}</strong>, schema{' '}
            <strong>{run.versions?.after.schema ?? 'unknown'}</strong>.
            {run.versions?.backupPath && ` A backup was saved to ${run.versions.backupPath}.`}
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
    );

  if (plan)
    return (
      <section className="panel" aria-labelledby="update-plan-heading">
        <h2 id="update-plan-heading">This update will</h2>
        <ul className="update-plan-list">
          <li>Worker: {componentLine(plan.update.worker)}</li>
          <li>Database schema: {componentLine(plan.update.schema)}</li>
        </ul>
        {plan.update.pending.length > 0 && (
          <>
            <h3>Pending database changes</h3>
            <ul className="update-plan-list">
              {plan.update.pending.map((migration) => (
                <li key={migration.name}>
                  {migration.description}
                  {migration.nonAdditive && ' (not purely additive)'}
                </li>
              ))}
            </ul>
          </>
        )}
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={skipBackup}
            onChange={(event) => setSkipBackup(event.target.checked)}
            disabled={plan.update.pending.some((migration) => migration.nonAdditive)}
          />
          Skip the database backup
        </label>
        <div className="form-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void approve()}>
            {busy ? 'Starting…' : 'Approve and update'}
          </button>
        </div>
        {confirmingSkip && (
          <ConfirmDialog
            title="Skip the backup?"
            confirmLabel="Update without a backup"
            busy={busy}
            onConfirm={() => void approve(true)}
            onCancel={() => setConfirmingSkip(false)}
          >
            <p>Without a backup, this data cannot be restored if the update goes wrong.</p>
          </ConfirmDialog>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
    );

  return (
    <section className="panel" aria-labelledby="update-start-heading">
      <h2 id="update-start-heading">Update this environment&rsquo;s backend</h2>
      <p>Backs up the database, then applies pending changes and redeploys the Worker.</p>
      <div className="form-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void makePlan()}>
          {busy ? 'Preparing…' : 'Show the update plan'}
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
