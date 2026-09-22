import { useEffect, useId, useRef, useState } from 'react';
import {
  ApiError,
  createEnvironment,
  listEnvironments,
  removeEnvironment,
  selectEnvironment,
  type EnvironmentSummary
} from '../api/local-operations.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { assertEnvironmentNameLooksValid } from './environment-name.js';

export type EnvironmentSwitcherRole = 'admin' | 'owner' | 'analyst' | undefined;

/**
 * Lists every saved environment, lets the admin switch, create, and remove one. A website owner or
 * analyst's key already fixes their one environment, so they never see this at all. With exactly one
 * environment saved, only a small, unobtrusive label is shown (research: "one environment is the
 * common case and stays simple").
 */
export function EnvironmentSwitcher({
  role,
  onChanged
}: {
  role: EnvironmentSwitcherRole;
  /** Called after a select, create, or remove, so the caller can reload the setup state. */
  onChanged: () => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const details = useRef<HTMLDetailsElement>(null);
  const nameId = useId();

  const load = async () => {
    try {
      const result = await listEnvironments();
      setActive(result.active);
      setEnvironments(result.environments);
      setLoaded(true);
    } catch {
      // A console that cannot list environments yet (very first load) just shows nothing.
    }
  };

  useEffect(() => {
    if (role === 'admin') void load();
  }, [role]);

  if (role !== 'admin' || !loaded) return null;

  async function select(target: string) {
    if (target === active) {
      details.current?.removeAttribute('open');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await selectEnvironment(target);
      setActive(target);
      details.current?.removeAttribute('open');
      onChanged();
    } catch {
      setError('Could not switch environments. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const problem = assertEnvironmentNameLooksValid(name);
    if (problem) {
      setNameError(problem);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await createEnvironment(name);
      setName('');
      setCreating(false);
      await load();
      details.current?.removeAttribute('open');
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'environment_name_taken'
          ? `An environment named "${name}" already exists.`
          : 'Could not create that environment. Try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    setBusy(true);
    setError(undefined);
    try {
      await removeEnvironment(target);
      setRemoving(undefined);
      await load();
      if (target === active) onChanged();
    } catch {
      setError('Could not remove that environment. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (environments.length <= 1)
    return (
      <span
        className="environment-label"
        aria-label={active ? `Environment: ${active}` : undefined}
      >
        {active}
      </span>
    );

  return (
    <details ref={details} className="environment-switcher">
      <summary aria-label={`Environment: ${active}. Switch or manage environments.`}>
        {active}
      </summary>
      <div className="environment-switcher-panel">
        <ul className="environment-list">
          {environments.map((item) => (
            <li key={item.name}>
              <button
                type="button"
                className={item.name === active ? 'environment-item current' : 'environment-item'}
                disabled={busy}
                aria-current={item.name === active}
                onClick={() => void select(item.name)}
              >
                {item.name}
                {!item.hasConnection && <span className="hint"> (not connected)</span>}
              </button>
              <button
                type="button"
                className="link-button danger"
                disabled={busy}
                aria-label={`Remove environment ${item.name}`}
                onClick={() => setRemoving(item.name)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {creating ? (
          <div className="environment-create">
            <label htmlFor={nameId}>New environment name</label>
            <input
              id={nameId}
              value={name}
              autoComplete="off"
              aria-describedby={nameError ? `${nameId}-error` : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(undefined);
              }}
            />
            {nameError && (
              <p id={`${nameId}-error`} className="notice error" role="alert">
                {nameError}
              </p>
            )}
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void create()}>
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="secondary" onClick={() => setCreating(true)}>
            New environment
          </button>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </div>
      {removing && (
        <ConfirmDialog
          title={`Remove "${removing}"?`}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(undefined)}
        >
          <p>
            This forgets the environment&rsquo;s saved connection and settings on this computer. It
            does <strong>not</strong> delete anything in Cloudflare; if you want to tear down its
            Worker, database, and storage, do that separately.
          </p>
        </ConfirmDialog>
      )}
    </details>
  );
}
