export function AccessState({
  state,
  onRetry
}: {
  state: 'loading' | 'denied' | 'offline';
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
  return (
    <section className="state-card" role="alert">
      <span className="state-icon">
        {denied ? <LockIcon size={24} /> : <AlertTriangleIcon size={24} />}
      </span>
      <h1>{denied ? 'Authorization required' : 'Workspace unavailable'}</h1>
      <p>
        {denied
          ? 'The local credential was revoked or expired. Reconfigure it from this machine, then reconnect.'
          : 'The local API or remote data plane could not be reached. Your website collection is unaffected.'}
      </p>
      <button className="primary" onClick={onRetry}>
        <RefreshIcon size={16} />
        Try again
      </button>
    </section>
  );
}
import { AlertTriangleIcon, LockIcon, RefreshIcon } from './Icons.js';
