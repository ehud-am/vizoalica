import { useState } from 'react';
import {
  disconnectBackend,
  setRoleHint,
  type RoleHint,
  type SetupState
} from '../api/local-operations.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ConnectForm } from './ConnectForm.js';
import { ROLE_CHOICES, roleLabel } from './roles.js';
import { useSetup } from './SetupProvider.js';

const STATUS_TEXT: Record<SetupState['connection']['status'], string> = {
  none: 'Not connected',
  connected: 'Connected',
  unreachable: 'The backend is not answering',
  revoked: 'The credential was rejected',
  incompatible: 'Not compatible with this console'
};

/** Review and change the connection and the remembered role. */
export function SetupPage({ onChanged }: { onChanged: (state?: SetupState) => void }) {
  const { state, replace } = useSetup();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hint: RoleHint = state?.connection.roleHint ?? 'admin';
  const [role, setRole] = useState<RoleHint>(hint);
  const oneCli = state?.connection.mode === 'onecli';

  async function chooseRole(next: RoleHint) {
    setRole(next);
    try {
      replace(await setRoleHint(next));
    } catch {
      setError('The role could not be saved. Try again.');
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      const next = await disconnectBackend();
      replace(next);
      onChanged(next);
    } catch {
      setError('The connection could not be removed. Try again.');
    } finally {
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <div className="page setup-page" data-page="setup">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Connection</h1>
          <p>The backend this console is connected to, and how you use it.</p>
        </div>
      </div>

      <section className="panel" aria-labelledby="connection-heading">
        <h2 id="connection-heading">Backend</h2>
        <dl className="detail-list">
          <div>
            <dt>Status</dt>
            <dd>{state ? STATUS_TEXT[state.connection.status] : 'Unknown'}</dd>
          </div>
          {state?.connection.workerHost && (
            <div>
              <dt>Address</dt>
              <dd>
                <code>{state.connection.workerHost}</code>
              </dd>
            </div>
          )}
          {state?.principal && (
            <div>
              <dt>Access</dt>
              <dd>
                {state.principal.role === 'owner'
                  ? 'Website owner'
                  : state.principal.role === 'analyst'
                    ? 'Analyst'
                    : 'Admin'}
                {state.principal.keyLabel ? ` (${state.principal.keyLabel})` : ''}
              </dd>
            </div>
          )}
          {state?.backend && (
            <div>
              <dt>Versions</dt>
              <dd>
                Worker {state.backend.workerVersion ?? 'unknown'} · Console {state.version}
              </dd>
            </div>
          )}
        </dl>
        {state?.backend && state.backend.message && <p className="hint">{state.backend.message}</p>}
        {state?.connection.status === 'unreachable' && (
          <p className="notice error" role="alert">
            The backend is not answering. Your websites keep collecting. Check the backend, then
            reload this page.
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="role-heading">
        <h2 id="role-heading">Who you are</h2>
        <p>
          This only changes what is shown first. What you can do is set by your credential
          {state?.principal
            ? ` (currently: ${roleLabel(state.principal.role === 'owner' ? 'website-owner' : state.principal.role)})`
            : ''}
          .
        </p>
        <fieldset className="role-choices">
          <legend className="sr-only">Who are you?</legend>
          {ROLE_CHOICES.map((choice) => (
            <label key={choice.hint} className="role-choice">
              <input
                type="radio"
                name="role-setting"
                checked={role === choice.hint}
                onChange={() => void chooseRole(choice.hint)}
              />
              <span>
                <strong>{choice.label}</strong> — {choice.blurb}
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className="panel" aria-labelledby="change-heading">
        <h2 id="change-heading">
          {state?.connection.status === 'none'
            ? 'Connect'
            : 'Use a different credential or backend'}
        </h2>
        {oneCli ? (
          <p>
            This computer keeps the administrator secret in OneCLI, so it cannot be changed here. To
            change it, use <code>pnpm vizoalica setup</code> from a source checkout.
          </p>
        ) : (
          <ConnectForm
            role={role}
            submitLabel={state?.connection.status === 'none' ? 'Connect' : 'Replace connection'}
            onConnected={(next) => {
              replace(next);
              onChanged(next);
            }}
          />
        )}
        {state && state.connection.status !== 'none' && !oneCli && (
          <div className="form-actions">
            <button
              className="danger"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Disconnect…
            </button>
          </div>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>

      {confirming && (
        <ConfirmDialog
          title="Disconnect from this backend?"
          confirmLabel="Disconnect"
          busy={busy}
          onConfirm={() => void disconnect()}
          onCancel={() => setConfirming(false)}
        >
          <p>
            This removes the saved credential from this computer. Your backend and your data are not
            touched, and you can connect again at any time.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
