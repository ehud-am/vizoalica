import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  issueAccessKey,
  listAccessKeys,
  listWebsites,
  renameAccessKey,
  revokeAccessKey,
  rotateAccessKey,
  type AccessKeyRole,
  type AccessKeySummary,
  type IssuedAccessKey,
  type Website
} from '../api/local-operations.js';
import { ActionButton } from '../components/ActionButton.js';
import { CodeBlock } from '../components/CodeBlock.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { CopyButton } from '../components/CopyButton.js';
import { MenuButton, type MenuItem } from '../components/MenuButton.js';
import { PageHeader } from '../components/PageHeader.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { useSetup } from '../setup/SetupProvider.js';
import { KeyInstructions } from './access/KeyInstructions.js';
import { WebsiteGate } from './WebsiteGate.js';

type ScopeKind = 'everything' | 'project' | 'website';

const ROLE_LABEL: Record<AccessKeyRole, string> = { analyst: 'Analyst', owner: 'Website owner' };

const ROLES: Array<MenuItem & { id: AccessKeyRole }> = [
  {
    id: 'analyst',
    label: 'Analyst',
    detail: 'Can view analytics and settings. Cannot change anything.'
  },
  {
    id: 'owner',
    label: 'Website owner',
    detail: 'Can view and manage websites and projects, within the access below.'
  }
];

const SCOPES: Array<MenuItem & { id: ScopeKind }> = [
  {
    id: 'everything',
    label: 'Everything',
    detail: 'Every project and website in this backend.'
  },
  { id: 'project', label: 'One project', detail: 'Only the websites in the project you choose.' },
  { id: 'website', label: 'One website', detail: 'Only the website you choose.' }
];

interface Errors {
  label?: string | undefined;
  project?: string | undefined;
  website?: string | undefined;
}

/** Shown once, right after creating or rotating: the key, and what to do with it. */
function RevealedKey({
  issued,
  access,
  rotated,
  onDone
}: {
  issued: IssuedAccessKey;
  access: string;
  rotated: boolean;
  onDone: () => void;
}) {
  const { state } = useSetup();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="panel key-reveal" aria-labelledby="key-reveal-heading">
      <h2 id="key-reveal-heading" ref={heading} tabIndex={-1}>
        Save this access key now
      </h2>
      <p>
        This is the only time <strong>{issued.label}</strong>&rsquo;s key is shown. It cannot be
        retrieved again; rotate it to get a new one.
        {rotated && ' The previous key stopped working when this one was made.'}
      </p>
      <code className="technical-value key-reveal-value">{issued.key}</code>
      <div className="form-actions">
        <CopyButton text={issued.key} what="access key" className="primary" />
      </div>
      <KeyInstructions
        workerUrl={state?.connection.workerUrl ?? ''}
        environment={state?.environment ?? ''}
        role={issued.role}
        access={access}
      />
      <div className="form-actions">
        <button className="secondary" type="button" onClick={onDone}>
          I have saved it
        </button>
      </div>
    </section>
  );
}

/** The key everyone has: the backend's own admin key. It lives on the Worker, not in the list. */
function AdminKeyRow({ environment }: { environment: string }) {
  const command = `vizoalica rotate ${environment || '<backend>'} admin`;
  return (
    <tr data-key="admin">
      <td>
        <strong>Admin key</strong>
        <span className="hint access-key-meta">
          Made when the backend was deployed. It cannot be deleted here, so there is always an admin
          key.
        </span>
      </td>
      <td>
        <span className="menu-badge">Admin</span>
      </td>
      <td>Everything</td>
      <td>Deployment</td>
      <td>
        <details className="access-admin-rotate">
          <summary>Rotate</summary>
          <p className="hint">
            From a terminal on a computer that has this backend (the console never holds your
            Cloudflare credentials):
          </p>
          <CodeBlock label="Rotate the admin key" code={command} what="rotate command" />
        </details>
      </td>
    </tr>
  );
}

type Pending =
  { kind: 'delete'; key: AccessKeySummary } | { kind: 'rotate'; key: AccessKeySummary };

function AccessKeys({ website }: { website?: Website | undefined }) {
  const scope = useScope();
  const { state } = useSetup();
  const id = useId();
  const [keys, setKeys] = useState<AccessKeySummary[] | undefined>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<AccessKeyRole>('analyst');
  // Least access by default: one project, the one already chosen at the top.
  const [scopeKind, setScopeKind] = useState<ScopeKind>(
    website ? 'website' : scope.activeProjects.length > 0 ? 'project' : 'everything'
  );
  const [projectId, setProjectId] = useState(scope.projectId);
  const [websiteId, setWebsiteId] = useState(website?.id ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<{
    key: IssuedAccessKey;
    access: string;
    rotated: boolean;
  }>();
  const [pending, setPending] = useState<Pending>();
  const [renaming, setRenaming] = useState<{ id: string; label: string }>();
  const labelRef = useRef<HTMLInputElement>(null);
  // Websites by project, loaded as they are needed for the picker and for naming keys in the list.
  const [websites, setWebsites] = useState<Record<string, Website[] | 'loading' | 'error'>>({});

  async function refresh() {
    try {
      setKeys(await listAccessKeys());
    } catch {
      setError('Access keys could not be loaded. Try again.');
    }
  }
  useEffect(() => void refresh(), []);
  useEffect(() => {
    if (creating) labelRef.current?.focus();
  }, [creating]);

  const wanted = useMemo(() => {
    const projects = new Set<string>();
    if (scopeKind === 'website' && projectId) projects.add(projectId);
    for (const key of keys ?? [])
      if (key.scope.sourceId && key.scope.projectId) projects.add(key.scope.projectId);
    return [...projects];
  }, [scopeKind, projectId, keys]);
  useEffect(() => {
    for (const project of wanted) {
      if (websites[project] !== undefined) continue;
      setWebsites((prior) => ({ ...prior, [project]: 'loading' }));
      listWebsites(project)
        .then((items) =>
          setWebsites((prior) => ({
            ...prior,
            [project]: items.filter((item) => item.status !== 'deleted')
          }))
        )
        .catch(() => setWebsites((prior) => ({ ...prior, [project]: 'error' })));
    }
  }, [wanted]);

  const projectName = (project: string | null) =>
    scope.projects.find((item) => item.id === project)?.name ?? project ?? '';
  const websiteName = (project: string | null, source: string | null) => {
    const list = project ? websites[project] : undefined;
    return (Array.isArray(list) && list.find((item) => item.id === source)?.name) || source || '';
  };
  const describe = (item: { projectId: string | null; sourceId: string | null }) =>
    item.sourceId
      ? `${websiteName(item.projectId, item.sourceId)} (${projectName(item.projectId)})`
      : item.projectId
        ? `Project ${projectName(item.projectId)}`
        : 'Everything';

  // Choosing another project at the top changes where a new key starts; keys already typed stay.
  useEffect(() => {
    if (website) return;
    setProjectId(scope.projectId);
    setWebsiteId('');
  }, [scope.projectId, website]);

  const projectSites = websites[projectId];
  const siteList = Array.isArray(projectSites) ? projectSites : [];
  const selectedWebsite = website ?? siteList.find((item) => item.id === websiteId);

  function chooseProject(next: string) {
    setProjectId(next);
    // A website belongs to one project, so a website chosen under another project is dropped.
    setWebsiteId('');
    setErrors((prior) => ({ ...prior, project: undefined, website: undefined }));
  }

  const summary = `${role === 'owner' ? 'A website owner' : 'An analyst'} key for ${
    scopeKind === 'everything'
      ? 'everything in this backend'
      : scopeKind === 'project'
        ? projectId
          ? `project ${projectName(projectId)}`
          : 'a project (choose one)'
        : selectedWebsite
          ? `${selectedWebsite.name} in ${projectName(projectId)}`
          : 'a website (choose one)'
  }.`;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: Errors = {};
    if (!label.trim()) found.label = 'Give the key a name, so you can tell keys apart.';
    if (scopeKind !== 'everything' && !projectId) found.project = 'Choose a project.';
    if (scopeKind === 'website' && !websiteId) found.website = 'Choose a website.';
    setErrors(found);
    if (found.label) return labelRef.current?.focus();
    if (found.project || found.website) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const issued = await issueAccessKey({
        label: label.trim(),
        role,
        ...(scopeKind !== 'everything' ? { projectId } : {}),
        ...(scopeKind === 'website' ? { sourceId: websiteId } : {})
      });
      setRevealed({ key: issued, access: describe(issued.scope), rotated: false });
      setLabel('');
      setCreating(false);
      await refresh();
    } catch {
      setError(
        'The access key could not be created. Check that the project and website still exist, then try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: AccessKeySummary) {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await revokeAccessKey(target.id);
      await refresh();
      setNotice(`Access key ${target.label} deleted. It stopped working immediately.`);
    } catch {
      setError('The access key could not be deleted. Try again.');
    } finally {
      setPending(undefined);
      setBusy(false);
    }
  }

  async function rotate(target: AccessKeySummary) {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const issued = await rotateAccessKey(target.id);
      setRevealed({ key: issued, access: describe(issued.scope), rotated: true });
      await refresh();
    } catch {
      setError('The access key could not be rotated. Nothing changed; try again.');
    } finally {
      setPending(undefined);
      setBusy(false);
    }
  }

  async function saveName() {
    if (!renaming) return;
    const next = renaming.label.trim();
    if (!next) return setError('A name cannot be empty.');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await renameAccessKey(renaming.id, next);
      setRenaming(undefined);
      await refresh();
      setNotice(`Renamed to ${next}.`);
    } catch {
      setError('The access key could not be renamed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  // A key shown on a website's page is one that reaches it: its own, its project's, or everything.
  const reaches = (key: AccessKeySummary) =>
    !website ||
    key.scope.sourceId === website.id ||
    (key.scope.sourceId === null &&
      (key.scope.projectId === null || key.scope.projectId === scope.projectId));
  const visible = useMemo(
    () => (keys ?? []).filter(reaches).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [keys, website, scope.projectId]
  );
  const active = visible.filter((key) => !key.revokedAt);
  const deleted = visible.filter((key) => key.revokedAt);
  const projectItems: MenuItem[] = scope.activeProjects.map((project) => ({
    id: project.id,
    label: project.name,
    detail: project.id
  }));
  const websiteItems: MenuItem[] = siteList.map((site) => ({
    id: site.id,
    label: site.name,
    detail: site.allowedOrigins[0] ?? site.id
  }));
  const day = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
  };
  const hub = website ? hrefFor('manage/websites/:id', website.id) : undefined;

  return (
    <div className="page access-page" data-page="access">
      <PageHeader
        crumbs={
          website
            ? [
                ...(scope.project ? [{ label: scope.project.name }] : []),
                { label: 'Websites', href: hrefFor('manage/websites') },
                { label: website.name, href: hub! },
                { label: 'Access keys' }
              ]
            : [{ label: 'Access keys' }]
        }
        {...(hub ? { back: { label: `Back to ${website!.name}`, href: hub } } : {})}
        title={website ? `Access keys for ${website.name}` : 'Access keys'}
        description={
          website
            ? 'Keys that let someone use this website without your admin key. A key reaches this website directly, through its project, or through everything.'
            : 'Keys that let people, scripts, and pipelines use this backend without your admin key. An analyst can only view results; a website owner can also manage websites. Key values are shown once, when made.'
        }
        actions={
          <ActionButton
            capability="manage-access-keys"
            className="primary"
            disabled={busy || creating}
            onClick={() => {
              setCreating(true);
              setRevealed(undefined);
            }}
          >
            Create access key
          </ActionButton>
        }
      />

      {revealed && (
        <RevealedKey
          issued={revealed.key}
          access={revealed.access}
          rotated={revealed.rotated}
          onDone={() => setRevealed(undefined)}
        />
      )}

      {creating && (
        <section className="panel" aria-labelledby={`${id}-create-heading`}>
          <h2 id={`${id}-create-heading`}>Create access key</h2>
          <form className="access-form" noValidate onSubmit={(event) => void create(event)}>
            <div className="field">
              <label htmlFor={`${id}-label`}>Name</label>
              <input
                id={`${id}-label`}
                ref={labelRef}
                value={label}
                maxLength={64}
                placeholder="Jane, analyst"
                aria-invalid={!!errors.label}
                aria-describedby={`${id}-label-hint${errors.label ? ` ${id}-label-error` : ''}`}
                onChange={(event) => {
                  setLabel(event.target.value);
                  if (errors.label) setErrors((prior) => ({ ...prior, label: undefined }));
                }}
              />
              {errors.label && (
                <span id={`${id}-label-error`} className="field-error">
                  {errors.label}
                </span>
              )}
              <small id={`${id}-label-hint`}>
                The person, script, or pipeline that will use it. It appears in the list so you can
                rotate or delete the right key later.
              </small>
            </div>

            <MenuButton
              variant="field"
              caption="Role"
              value={ROLES.find((item) => item.id === role)!.label}
              items={ROLES}
              selected={role}
              onSelect={(next) => setRole(next as AccessKeyRole)}
            />
            {!website && (
              <MenuButton
                variant="field"
                caption="Access"
                value={SCOPES.find((item) => item.id === scopeKind)!.label}
                items={SCOPES}
                selected={scopeKind}
                onSelect={(next) => {
                  setScopeKind(next as ScopeKind);
                  setErrors({});
                }}
              />
            )}
            {!website && scopeKind !== 'everything' && (
              <>
                <MenuButton
                  variant="field"
                  caption="Project"
                  value={projectId ? projectName(projectId) : 'Choose a project'}
                  items={projectItems}
                  selected={projectId}
                  invalid={!!errors.project}
                  describedBy={errors.project ? `${id}-project-error` : undefined}
                  onSelect={chooseProject}
                />
                {errors.project && (
                  <span id={`${id}-project-error`} className="field-error">
                    {errors.project}
                  </span>
                )}
              </>
            )}
            {!website && scopeKind === 'website' && (
              <>
                <MenuButton
                  variant="field"
                  caption="Website"
                  value={selectedWebsite?.name ?? 'Choose a website'}
                  items={websiteItems}
                  selected={websiteId}
                  disabled={!projectId || websiteItems.length === 0}
                  invalid={!!errors.website}
                  describedBy={errors.website ? `${id}-website-error` : `${id}-website-hint`}
                  onSelect={(next) => {
                    setWebsiteId(next);
                    setErrors((prior) => ({ ...prior, website: undefined }));
                  }}
                />
                {errors.website ? (
                  <span id={`${id}-website-error`} className="field-error">
                    {errors.website}
                  </span>
                ) : (
                  <small id={`${id}-website-hint`}>
                    {!projectId
                      ? 'Choose a project first.'
                      : projectSites === 'error'
                        ? 'Websites could not be loaded. Choose the project again to retry.'
                        : projectSites === undefined || projectSites === 'loading'
                          ? 'Loading websites…'
                          : siteList.length === 0
                            ? 'This project has no websites yet. Add one first, or choose another project.'
                            : ''}
                  </small>
                )}
              </>
            )}

            <p className="access-summary" aria-live="polite">
              {summary}
            </p>
            <div className="form-actions">
              <ActionButton
                capability="manage-access-keys"
                type="submit"
                className="primary"
                disabled={busy}
              >
                {busy ? 'Creating…' : 'Create access key'}
              </ActionButton>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setCreating(false);
                  setErrors({});
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel" aria-labelledby={`${id}-list-heading`}>
        <h2 id={`${id}-list-heading`}>Access keys</h2>
        {notice && (
          <p className="notice success" role="status">
            {notice}{' '}
            <button className="link-button" type="button" onClick={() => setNotice('')}>
              Dismiss
            </button>
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {keys === undefined ? (
          <p aria-busy="true">Loading…</p>
        ) : (
          <div className="table-scroll">
            <table className="access-key-table" aria-label="Access keys">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Access</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!website && <AdminKeyRow environment={state?.environment ?? ''} />}
                {active.map((key) => (
                  <tr key={key.id} data-key={key.id}>
                    <td>
                      {renaming?.id === key.id ? (
                        <form
                          className="access-rename"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void saveName();
                          }}
                        >
                          <input
                            aria-label={`New name for ${key.label}`}
                            value={renaming.label}
                            maxLength={64}
                            autoFocus
                            onChange={(event) =>
                              setRenaming({ id: key.id, label: event.target.value })
                            }
                          />
                          <button className="primary" type="submit" disabled={busy}>
                            Save
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            disabled={busy}
                            onClick={() => setRenaming(undefined)}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <strong>{key.label}</strong>
                      )}
                    </td>
                    <td>
                      <span className="menu-badge">{ROLE_LABEL[key.role]}</span>
                    </td>
                    <td>{describe(key.scope)}</td>
                    <td>{day(key.createdAt)}</td>
                    <td className="access-key-actions">
                      <ActionButton
                        capability="manage-access-keys"
                        className="secondary"
                        disabled={busy}
                        aria-label={`Rename ${key.label}`}
                        onClick={() => setRenaming({ id: key.id, label: key.label })}
                      >
                        Rename
                      </ActionButton>
                      <ActionButton
                        capability="manage-access-keys"
                        className="secondary"
                        disabled={busy}
                        aria-label={`Rotate ${key.label}`}
                        onClick={() => setPending({ kind: 'rotate', key })}
                      >
                        Rotate…
                      </ActionButton>
                      <ActionButton
                        capability="manage-access-keys"
                        className="danger"
                        disabled={busy}
                        aria-label={`Delete ${key.label}`}
                        onClick={() => setPending({ kind: 'delete', key })}
                      >
                        Delete…
                      </ActionButton>
                    </td>
                  </tr>
                ))}
                {active.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      No other access keys yet. Create one to give someone, or a pipeline, access
                      without your admin key.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {deleted.length > 0 && (
          <details className="access-deleted">
            <summary>
              {deleted.length} deleted {deleted.length === 1 ? 'key' : 'keys'}
            </summary>
            <ul className="access-key-list" aria-label="Deleted access keys">
              {deleted.map((key) => (
                <li key={key.id} data-revoked="true">
                  <strong>{key.label}</strong>{' '}
                  <span className="menu-badge">{ROLE_LABEL[key.role]}</span>
                  <span className="hint access-key-meta">
                    {describe(key.scope)} · created {day(key.createdAt)} · deleted{' '}
                    {day(key.revokedAt!)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <details className="panel access-howto">
        <summary>How is an access key used?</summary>
        <KeyInstructions
          workerUrl={state?.connection.workerUrl ?? ''}
          environment={state?.environment ?? ''}
          role={role}
        />
      </details>

      {pending?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete ${pending.key.label}?`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => void remove(pending.key)}
          onCancel={() => setPending(undefined)}
        >
          <p>
            <strong>{pending.key.label}</strong> stops working immediately. Anyone using it, on any
            computer or pipeline, loses access. This cannot be undone; create a new key if it is
            needed again.
          </p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'rotate' && (
        <ConfirmDialog
          title={`Rotate ${pending.key.label}?`}
          confirmLabel="Rotate"
          busy={busy}
          onConfirm={() => void rotate(pending.key)}
          onCancel={() => setPending(undefined)}
        >
          <p>
            A new key replaces <strong>{pending.key.label}</strong>&rsquo;s key. The name, role, and
            access stay the same. The old key stops working immediately, so everyone using it must
            be given the new one, which is shown once.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Admin only: create, rename, rotate, and delete the access keys of this backend, or of one website. */
export function AccessPage({ websiteId }: { websiteId?: string | undefined } = {}) {
  if (websiteId)
    return (
      <WebsiteGate websiteId={websiteId}>
        {(website) => <AccessKeys website={website} />}
      </WebsiteGate>
    );
  return <AccessKeys />;
}
