import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  issueAccessKey,
  listAccessKeys,
  listWebsites,
  revokeAccessKey,
  type AccessKeyRole,
  type AccessKeySummary,
  type IssuedAccessKey,
  type Website
} from '../api/local-operations.js';
import { ActionButton } from '../components/ActionButton.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { CopyButton } from '../components/CopyButton.js';
import { MenuButton, type MenuItem } from '../components/MenuButton.js';
import { PageHeader } from '../components/PageHeader.js';
import { useScope } from '../scope/ScopeProvider.js';
import { useSetup } from '../setup/SetupProvider.js';
import { KeyInstructions } from './access/KeyInstructions.js';

type ScopeKind = 'everything' | 'project' | 'website';

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
    detail: 'Every project and website in this environment.'
  },
  { id: 'project', label: 'One project', detail: 'Only the websites in the project you choose.' },
  { id: 'website', label: 'One website', detail: 'Only the website you choose.' }
];

interface Errors {
  label?: string | undefined;
  project?: string | undefined;
  website?: string | undefined;
}

/** Shown once, right after issuing: the key, and what to do with it. */
function RevealedKey({
  issued,
  access,
  onDone
}: {
  issued: IssuedAccessKey;
  access: string;
  onDone: () => void;
}) {
  const { state } = useSetup();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="panel key-reveal" aria-labelledby="key-reveal-heading">
      <h2 id="key-reveal-heading" ref={heading} tabIndex={-1}>
        Save this key now
      </h2>
      <p>
        This is the only time <strong>{issued.label}</strong>&rsquo;s key is shown. It cannot be
        retrieved again; issue a new one if it is lost.
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

/** Admin only: issue, list, and revoke the keys analysts and website owners connect with. */
export function AccessPage() {
  const scope = useScope();
  const { state } = useSetup();
  const id = useId();
  const [keys, setKeys] = useState<AccessKeySummary[] | undefined>();
  const [error, setError] = useState('');
  // The result of a revoke, shown by the list it changed (the page may be scrolled far from the top).
  const [revokedNotice, setRevokedNotice] = useState('');
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<AccessKeyRole>('analyst');
  // Least access by default: one project, the one already chosen at the top.
  const [scopeKind, setScopeKind] = useState<ScopeKind>(
    scope.activeProjects.length > 0 ? 'project' : 'everything'
  );
  const [projectId, setProjectId] = useState(scope.projectId);
  const [websiteId, setWebsiteId] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<IssuedAccessKey>();
  const [revealedAccess, setRevealedAccess] = useState('');
  const [pendingRevoke, setPendingRevoke] = useState<AccessKeySummary>();
  const labelRef = useRef<HTMLInputElement>(null);
  // Websites by project, loaded as they are needed for the picker and for naming keys in the list.
  const [websites, setWebsites] = useState<Record<string, Website[] | 'loading' | 'error'>>({});

  async function refresh() {
    try {
      setKeys(await listAccessKeys());
    } catch {
      setError('Keys could not be loaded. Try again.');
    }
  }
  useEffect(() => void refresh(), []);

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
    setProjectId(scope.projectId);
    setWebsiteId('');
  }, [scope.projectId]);

  const projectSites = websites[projectId];
  const siteList = Array.isArray(projectSites) ? projectSites : [];
  const selectedWebsite = siteList.find((item) => item.id === websiteId);

  function chooseProject(next: string) {
    setProjectId(next);
    // A website belongs to one project, so a website chosen under another project is dropped.
    setWebsiteId('');
    setErrors((prior) => ({ ...prior, project: undefined, website: undefined }));
  }

  const summary = `${role === 'owner' ? 'A website owner' : 'An analyst'} key for ${
    scopeKind === 'everything'
      ? 'everything in this environment'
      : scopeKind === 'project'
        ? projectId
          ? `project ${projectName(projectId)}`
          : 'a project (choose one)'
        : selectedWebsite
          ? `${selectedWebsite.name} in ${projectName(projectId)}`
          : 'a website (choose one)'
  }.`;

  async function issue(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: Errors = {};
    if (!label.trim()) found.label = 'Say who or what this key is for, so you can tell keys apart.';
    if (scopeKind !== 'everything' && !projectId) found.project = 'Choose a project.';
    if (scopeKind === 'website' && !websiteId) found.website = 'Choose a website.';
    setErrors(found);
    if (found.label) return labelRef.current?.focus();
    if (found.project || found.website) return;
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
      setRevealedAccess(describe(issued.scope));
      setLabel('');
      await refresh();
    } catch {
      setError(
        'The key could not be issued. Check that the project and website still exist, then try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!pendingRevoke) return;
    const target = pendingRevoke;
    setBusy(true);
    setRevokedNotice('');
    try {
      await revokeAccessKey(target.id);
      await refresh();
      setRevokedNotice(`Key ${target.label} revoked. It stopped working immediately.`);
    } catch {
      setError('The key could not be revoked. Try again.');
    } finally {
      setPendingRevoke(undefined);
      setBusy(false);
    }
  }

  const ordered = useMemo(
    () =>
      [...(keys ?? [])].sort(
        (a, b) =>
          Number(!!a.revokedAt) - Number(!!b.revokedAt) || b.createdAt.localeCompare(a.createdAt)
      ),
    [keys]
  );
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

  return (
    <div className="page access-page" data-page="access">
      <PageHeader
        crumbs={[{ label: 'Access keys' }]}
        title="Access keys"
        description="A key lets an analyst (who can only view) or a website owner (who can manage) connect to this environment without your administrator secret. Issue one to share access, and revoke it to end that access."
      />

      {revealed && (
        <RevealedKey
          issued={revealed}
          access={revealedAccess}
          onDone={() => {
            setRevealed(undefined);
            labelRef.current?.focus();
          }}
        />
      )}

      <section className="panel" aria-labelledby={`${id}-issue-heading`}>
        <h2 id={`${id}-issue-heading`}>Issue a key</h2>
        <form className="access-form" noValidate onSubmit={(event) => void issue(event)}>
          <div className="field">
            <label htmlFor={`${id}-label`}>Who is it for?</label>
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
              A name for the person or tool. It appears in the list below so you can revoke the
              right key later.
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
          {scopeKind !== 'everything' && (
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
          {scopeKind === 'website' && (
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
          {error && !keys && (
            <p className="notice error" role="alert">
              {error}
            </p>
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
        {revokedNotice && (
          <p className="notice success" role="status">
            {revokedNotice}{' '}
            <button className="link-button" type="button" onClick={() => setRevokedNotice('')}>
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
        ) : keys.length === 0 ? (
          <p>
            No keys yet. Issue one above; you will see here who has one, what it reaches, and you
            can revoke it.
          </p>
        ) : (
          <ul className="access-key-list" aria-label="Access keys">
            {ordered.map((key) => (
              <li key={key.id} data-revoked={key.revokedAt ? 'true' : undefined}>
                <div>
                  <strong>{key.label}</strong>{' '}
                  <span className="menu-badge">
                    {key.role === 'owner' ? 'Website owner' : 'Analyst'}
                  </span>{' '}
                  {key.revokedAt && <span className="menu-badge">Revoked</span>}
                  <span className="hint access-key-meta">
                    {describe(key.scope)} · issued {day(key.createdAt)}
                    {key.revokedAt ? ` · revoked ${day(key.revokedAt)}` : ''}
                  </span>
                </div>
                {!key.revokedAt && (
                  <ActionButton
                    capability="manage-access-keys"
                    className="danger"
                    disabled={busy}
                    aria-label={`Revoke ${key.label}`}
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

      <details className="panel access-howto">
        <summary>How is a key used?</summary>
        <KeyInstructions
          workerUrl={state?.connection.workerUrl ?? ''}
          environment={state?.environment ?? ''}
          role={role}
        />
      </details>

      {pendingRevoke && (
        <ConfirmDialog
          title={`Revoke ${pendingRevoke.label}?`}
          confirmLabel="Revoke"
          busy={busy}
          onConfirm={() => void revoke()}
          onCancel={() => setPendingRevoke(undefined)}
        >
          <p>
            <strong>{pendingRevoke.label}</strong> stops working immediately. Anyone using it, on
            any computer, loses access. This cannot be undone; issue a new key if it is needed
            again.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
