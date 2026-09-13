export function AccessState({
  state,
  reason,
  onRetry
}: {
  state: 'loading' | 'denied' | 'offline';
  reason?: 'session_expired' | 'worker_authorization' | undefined;
  onRetry: () => void;
}) {
  if (state === 'loading')
    return (
      <section className="state-card" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <h1>Opening your workspace</h1>
        <p>Establishing a private local session…</p>
      </section>
    );
  const denied = state === 'denied';
  const sessionExpired = denied && reason === 'session_expired';
  return (
    <section className="state-card" role="alert">
      <span className="state-icon">
        {denied ? <LockIcon size={24} /> : <AlertTriangleIcon size={24} />}
      </span>
      <h1>{denied ? 'Authorization required' : 'Workspace unavailable'}</h1>
      <p>
        {denied
          ? sessionExpired
            ? 'Your browser session expired. Reconnect to create a new private local session.'
            : 'The Worker rejected the configured administrator credential. Check pnpm ops status, then repair the credential or restart in its configured mode.'
          : 'The local API or remote data plane could not be reached. Your website collection is unaffected.'}
      </p>
      <button className="primary" onClick={onRetry}>
        <RefreshIcon size={16} />
        {sessionExpired ? 'Reconnect' : 'Try again'}
      </button>
    </section>
  );
}
import { AlertTriangleIcon, LockIcon, RefreshIcon } from './Icons.js';
