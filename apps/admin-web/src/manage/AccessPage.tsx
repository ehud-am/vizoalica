import { useEffect, useId, useState } from 'react';
import {
  issueAccessKey,
  listAccessKeys,
  revokeAccessKey,
  type AccessKeyRole,
  type AccessKeySummary,
  type IssuedAccessKey
} from '../api/local-operations.js';
import { ActionButton } from '../components/ActionButton.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { CopyButton } from '../components/CopyButton.js';
import { PageHeader } from '../components/PageHeader.js';
import { useScope } from '../scope/ScopeProvider.js';

/** Shown once, right after issuing, with an explicit confirmation before it is wiped from the screen. */
function RevealedKey({ issued, onDone }: { issued: IssuedAccessKey; onDone: () => void }) {
  return (
    <div className="panel key-reveal" role="alertdialog" aria-labelledby="key-reveal-heading">
      <h2 id="key-reveal-heading">Save this key now</h2>
      <p>
        This is the only time <strong>{issued.label}</strong>&rsquo;s key is shown. It cannot be
        retrieved again; issue a new one if it is lost.
      </p>
      <code className="technical-value key-reveal-value">{issued.key}</code>
      <div className="form-actions">
        <CopyButton text={issued.key} what="access key" className="primary" />
        <button className="secondary" type="button" onClick={onDone}>
          I have saved it
        </button>
      </div>
    </div>
  );
}

/** Admin only: issue, list, and revoke the keys analysts and website owners use. */
export function AccessPage() {
  const scope = useScope();
  const id = useId();
  const [keys, setKeys] = useState<AccessKeySummary[] | undefined>();
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<AccessKeyRole>('analyst');
  const [scopeKind, setScopeKind] = useState<'everything' | 'project' | 'website'>('everything');
  const [projectId, setProjectId] = useState('');
  const [websiteId, setWebsiteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<IssuedAccessKey>();
  const [pendingRevoke, setPendingRevoke] = useState<AccessKeySummary>();

  async function refresh() {
    try {
      setKeys(await listAccessKeys());
    } catch {
      setError('Keys could not be loaded. Try again.');
    }
  }
  useEffect(() => void refresh(), []);

  async function issue() {
    if (!label.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const issued = await issueAccessKey({
        label: label.trim(),
        role,
        ...(scopeKind !== 'everything' ? { projectId } : {}),
        ...(scopeKind === 'website' ? { sourceId: websiteId } : {})
      });
      setRevealed(issued);
      setLabel('');
      await refresh();
    } catch {
      setError('The key could not be issued. Check the scope and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!pendingRevoke) return;
    setBusy(true);
    try {
      await revokeAccessKey(pendingRevoke.id);
      await refresh();
    } catch {
      setError('The key could not be revoked. Try again.');
    } finally {
      setPendingRevoke(undefined);
      setBusy(false);
    }
  }

  const scopeLabel = (key: AccessKeySummary) =>
    key.scope.sourceId ? 'One website' : key.scope.projectId ? 'One project' : 'Everything';

  return (
    <div className="page access-page" data-page="access">
      <PageHeader
        crumbs={[{ label: 'Access' }]}
        title="Access"
        description="Issue and revoke the keys analysts and website owners connect with."
      />

      {revealed && <RevealedKey issued={revealed} onDone={() => setRevealed(undefined)} />}

      <section className="panel" aria-labelledby={`${id}-issue-heading`}>
        <h2 id={`${id}-issue-heading`}>Issue a key</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void issue();
          }}
        >
          <label htmlFor={`${id}-label`}>
            Label
            <input
              id={`${id}-label`}
              value={label}
              required
              maxLength={64}
              placeholder="Jane, analyst"
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <fieldset className="role-choices">
            <legend>Role</legend>
            <label className="role-choice">
              <input
                type="radio"
                name="key-role"
                checked={role === 'analyst'}
                onChange={() => setRole('analyst')}
              />
              <span>
                <strong>Analyst</strong> — sees analytics and configuration, changes nothing.
              </span>
            </label>
            <label className="role-choice">
              <input
                type="radio"
                name="key-role"
                checked={role === 'owner'}
                onChange={() => setRole('owner')}
              />
              <span>
                <strong>Website owner</strong> — manages projects and websites within the scope
                below.
              </span>
            </label>
          </fieldset>
          <label htmlFor={`${id}-scope`}>
            Scope
            <select
              id={`${id}-scope`}
              value={scopeKind}
              onChange={(event) => setScopeKind(event.target.value as typeof scopeKind)}
            >
              <option value="everything">Everything</option>
              <option value="project">One project</option>
              <option value="website">One website</option>
            </select>
          </label>
          {scopeKind !== 'everything' && (
            <label htmlFor={`${id}-project`}>
              Project
              <select
                id={`${id}-project`}
                value={projectId}
                required
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="" disabled>
                  Choose a project
                </option>
                {scope.activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scopeKind === 'website' && (
            <label htmlFor={`${id}-website`}>
              Website
              <input
                id={`${id}-website`}
                value={websiteId}
                required
                placeholder="Website id"
                onChange={(event) => setWebsiteId(event.target.value)}
              />
            </label>
          )}
          <div className="form-actions">
            <ActionButton
              capability="manage-access-keys"
              type="submit"
              className="primary"
              disabled={busy}
            >
              {busy ? 'Issuing…' : 'Issue key'}
            </ActionButton>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby={`${id}-list-heading`}>
        <h2 id={`${id}-list-heading`}>Keys</h2>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {keys === undefined ? (
          <p aria-busy="true">Loading…</p>
        ) : keys.length === 0 ? (
          <p>No keys yet.</p>
        ) : (
          <ul className="access-key-list" aria-label="Access keys">
            {keys.map((key) => (
              <li key={key.id}>
                <div>
                  <strong>{key.label}</strong>
                  <span className="hint">
                    {' '}
                    {key.role === 'owner' ? 'Website owner' : 'Analyst'} · {scopeLabel(key)}
                    {key.revokedAt ? ' · Revoked' : ''}
                  </span>
                </div>
                {!key.revokedAt && (
                  <ActionButton
                    capability="manage-access-keys"
                    className="danger"
                    disabled={busy}
                    onClick={() => setPendingRevoke(key)}
                  >
                    Revoke…
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingRevoke && (
        <ConfirmDialog
          title={`Revoke ${pendingRevoke.label}?`}
          confirmLabel="Revoke"
          busy={busy}
          onConfirm={() => void revoke()}
          onCancel={() => setPendingRevoke(undefined)}
        >
          <p>
            <strong>{pendingRevoke.label}</strong> stops working immediately. This cannot be undone;
            issue a new key if it is needed again.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
