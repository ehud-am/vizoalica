import { useId, useState, type FormEvent } from 'react';
import {
  ApiError,
  connectBackend,
  type RoleHint,
  type SetupState
} from '../api/local-operations.js';
import { CREDENTIAL_LABEL } from './roles.js';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return 'The backend did not accept that credential. Check it and try again.';
    if (error.status === 503 || error.code === 'unreachable')
      return 'The backend could not be reached. Check the address and try again.';
    if (error.status === 400)
      return 'Check the address (it starts with https://) and the credential, then try again.';
    if (error.status === 422)
      return 'This backend does not work with this console. Update the console: npm update -g vizoalica';
  }
  return 'The connection could not be made. Try again.';
}

/** The address and credential of an existing backend. The backend, not this form, decides the role. */
export function ConnectForm({
  role,
  onConnected,
  submitLabel = 'Connect',
  cancel
}: {
  role: RoleHint;
  onConnected: (state: SetupState) => void;
  submitLabel?: string;
  cancel?: React.ReactNode;
}) {
  const id = useId();
  const [workerUrl, setWorkerUrl] = useState('');
  const [credential, setCredential] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = CREDENTIAL_LABEL[role];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const state = await connectBackend({
        workerUrl: workerUrl.trim(),
        credential: credential.trim(),
        roleHint: role
      });
      setCredential('');
      onConnected(state);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="connect-form"
      onSubmit={(event) => void submit(event)}
      aria-label="Connect to a backend"
    >
      <label htmlFor={`${id}-url`}>
        Backend address
        <input
          id={`${id}-url`}
          value={workerUrl}
          required
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          placeholder="https://vizoalica.your-name.workers.dev"
          aria-describedby={`${id}-url-help`}
          onChange={(event) => setWorkerUrl(event.target.value)}
        />
      </label>
      <small id={`${id}-url-help`}>The address of the Worker, starting with https://.</small>
      <label htmlFor={`${id}-credential`}>
        {label}
        <input
          id={`${id}-credential`}
          type="password"
          value={credential}
          required
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-credential-help`}
          onChange={(event) => setCredential(event.target.value)}
        />
      </label>
      <small id={`${id}-credential-help`}>
        {role === 'admin'
          ? 'It stays on this computer, in a file only you can read.'
          : 'Your admin gives you this. It stays on this computer, in a file only you can read.'}
      </small>
      <div aria-live="assertive">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="form-actions">
        <button
          className="primary"
          type="submit"
          aria-disabled={busy}
          disabled={busy || !workerUrl.trim() || !credential.trim()}
        >
          {busy ? 'Connecting…' : submitLabel}
        </button>
        {cancel}
      </div>
    </form>
  );
}
