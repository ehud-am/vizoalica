import { useEffect, useRef, useState } from 'react';
import {
  cleanupDeployRun,
  createDeployPlan,
  getDeployPreflight,
  getDeployRun,
  resumeDeployRun,
  revealDeploySecrets,
  startDeployRun,
  type DeployPlan,
  type DeployPreflight,
  type DeployRun
} from '../api/local-operations.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { CopyButton } from '../components/CopyButton.js';

const POLL_MS = 1500;

/**
 * Deploys the selected environment's backend from the console: a plan shown and approved before
 * anything is created, ordered steps with live progress, a failed step's resume and cleanup, and
 * generated secrets shown once. Nothing here reads or writes a source checkout (research R27).
 */
export function DeployWizard({ onDeployed }: { onDeployed: () => void }) {
  const [preflight, setPreflight] = useState<DeployPreflight | undefined>();
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<DeployPlan | undefined>();
  const [run, setRun] = useState<DeployRun | undefined>();
  const [busy, setBusy] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [secrets, setSecrets] = useState<Record<string, string> | undefined>();
  const [secretsWiped, setSecretsWiped] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    getDeployPreflight()
      .then(setPreflight)
      .catch(() => setError('The deployment tool could not be reached. Try again.'));
  }, []);

  useEffect(() => () => clearInterval(timer.current), []);

  function poll(runId: string) {
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      void getDeployRun(runId).then((next) => {
        setRun(next);
        if (next.status !== 'running') clearInterval(timer.current);
      });
    }, POLL_MS);
  }

  async function makePlan() {
    setBusy(true);
    setError('');
    try {
      const accountId = preflight?.accounts[0]?.id;
      setPlan(await createDeployPlan(accountId ? { accountId } : {}));
    } catch {
      setError('The plan could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      const started = await startDeployRun(plan.id);
      setRun(started);
      if (started.status === 'running') poll(started.id);
    } catch {
      setError('The deployment could not be started. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    if (!run) return;
    setBusy(true);
    try {
      const resumed = await resumeDeployRun(run.id);
      setRun(resumed);
      poll(resumed.id);
    } catch {
      setError('The deployment could not be resumed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function cleanup() {
    if (!run) return;
    setBusy(true);
    try {
      await cleanupDeployRun(run.id);
      setRun(undefined);
      setPlan(undefined);
      setCleaningUp(false);
    } catch {
      setError('Cleanup did not complete. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!run) return;
    try {
      const result = await revealDeploySecrets(run.id);
      setSecrets(result.secrets);
    } catch {
      setError('The secrets could not be shown; they may already have been revealed or expired.');
    }
  }

  if (error && !preflight)
    return (
      <p className="notice error" role="alert">
        {error}
      </p>
    );
  if (!preflight)
    return <p aria-live="polite">Checking this environment&rsquo;s Cloudflare access…</p>;

  if (!preflight.signedIn)
    return (
      <p className="notice error" role="alert">
        Cloudflare did not recognize this environment&rsquo;s credential. Fix it from the
        environment switcher (create it again with a valid token, or check its OneCLI setup), then
        reload this page.
      </p>
    );

  if (secrets)
    return (
      <section className="panel" aria-labelledby="deploy-secrets-heading">
        <h2 id="deploy-secrets-heading">Save these now</h2>
        <p>These are shown once. Put each one in your password manager before you continue.</p>
        <dl className="detail-list">
          {Object.entries(secrets).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                <code>{value}</code> <CopyButton text={value} what={name} />
              </dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setSecretsWiped(true);
            setSecrets(undefined);
            onDeployed();
          }}
        >
          I have saved them
        </button>
      </section>
    );

  if (run) {
    return (
      <section className="panel" aria-labelledby="deploy-progress-heading">
        <h2 id="deploy-progress-heading">
          {run.status === 'done' ? 'Deployed' : run.status === 'failed' ? 'Stopped' : 'Deploying…'}
        </h2>
        <ol className="steps deploy-steps" aria-live="polite">
          {run.steps.map((step) => (
            <li key={step.id} data-status={step.status}>
              <span aria-hidden="true">
                {step.status === 'done'
                  ? '✓'
                  : step.status === 'failed'
                    ? '✕'
                    : step.status === 'running'
                      ? '…'
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
            <button
              type="button"
              className="secondary danger"
              disabled={busy}
              onClick={() => setCleaningUp(true)}
            >
              Clean up…
            </button>
          </div>
        )}
        {run.status === 'done' && run.canReveal && !secretsWiped && (
          <div className="form-actions">
            <button type="button" className="primary" onClick={() => void reveal()}>
              Show the generated secrets
            </button>
          </div>
        )}
        {run.status === 'done' && (!run.canReveal || secretsWiped) && (
          <p role="status">
            Connected: <strong>{run.result?.workerUrl}</strong>
          </p>
        )}
        {cleaningUp && (
          <ConfirmDialog
            title="Remove what this run created?"
            confirmLabel="Remove"
            busy={busy}
            onConfirm={() => void cleanup()}
            onCancel={() => setCleaningUp(false)}
          >
            <p>
              This removes only the database and storage bucket this run created (named
              <code> {plan?.names.database}</code> and <code>{plan?.names.bucket}</code>); nothing
              else in your Cloudflare account is touched.
            </p>
          </ConfirmDialog>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  if (plan)
    return (
      <section className="panel" aria-labelledby="deploy-plan-heading">
        <h2 id="deploy-plan-heading">This will create</h2>
        <ul className="deploy-plan-list">
          {plan.resources.map((resource) => (
            <li key={resource.name}>
              <strong>{resource.name}</strong> ({resource.kind}) — {resource.purpose}
            </li>
          ))}
        </ul>
        <p>
          Cloudflare bills D1 and R2 by usage; Vizoalica charges nothing itself. Nothing is created
          until you approve.
        </p>
        <div className="form-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void approve()}>
            {busy ? 'Starting…' : 'Approve and deploy'}
          </button>
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
    );

  return (
    <section className="panel" aria-labelledby="deploy-start-heading">
      <h2 id="deploy-start-heading">Deploy this environment&rsquo;s backend</h2>
      <p>
        Every resource will be named starting with <code>{preflight.environment}-</code>, so it
        never collides with another environment.
      </p>
      {(preflight.existing.database || preflight.existing.bucket) && (
        <p className="notice error" role="alert">
          A resource named{' '}
          {preflight.existing.database ? preflight.names.database : preflight.names.bucket} already
          exists in this Cloudflare account. Pick a different environment name, or connect to the
          existing backend instead.
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="primary"
          disabled={busy || preflight.existing.database || preflight.existing.bucket}
          onClick={() => void makePlan()}
        >
          {busy ? 'Preparing…' : 'Show the deployment plan'}
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
