import { useState } from 'react';
import {
  ApiError,
  createWebsite,
  deleteWebsite,
  updateWebsite,
  type Website
} from '../api/local-operations.js';
import { ActionButton } from '../components/ActionButton.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { NoProject } from '../components/NoProject.js';
import { WebsiteForm } from '../components/WebsiteForm.js';
import { WebsiteList } from '../components/WebsiteList.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { DangerZone } from './DangerZone.js';

type Pending = { kind: 'delete' | 'disable'; website: Website };

export function WebsitesPage() {
  const scope = useScope();
  const { projectId, project, website } = scope;
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await action();
    } catch {
      setError(
        'The operation was interrupted. Check the current status, then retry safely if needed.'
      );
    } finally {
      setBusy(false);
      setPending(undefined);
    }
  }

  async function addWebsite(input: { projectId?: string; name: string; allowedOrigins: string[] }) {
    const targetProject = scope.activeProjects.find((item) => item.id === input.projectId);
    if (!input.projectId || !targetProject) {
      setError('The selected project is no longer available. Refresh Projects and try again.');
      throw new Error('project_unavailable');
    }
    try {
      const created = await createWebsite(input.projectId, {
        name: input.name,
        allowedOrigins: input.allowedOrigins
      });
      if (input.projectId === projectId) {
        await scope.refreshWebsites();
        scope.selectWebsite(created.id);
      } else {
        scope.selectProject(input.projectId);
        scope.selectWebsite(created.id);
      }
      setError('');
      setMessage(
        `Website ${created.name} created in project ${targetProject.name} (${targetProject.id}).`
      );
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 404
          ? 'The selected project is no longer available. Your entries were preserved.'
          : 'Website creation was interrupted. Your entries were preserved.'
      );
      throw reason;
    }
  }

  async function editWebsite(input: { name: string; allowedOrigins: string[] }) {
    if (!website) return;
    await updateWebsite(projectId, website.id, input);
    setMessage('Website updated and audit recorded.');
    await scope.refreshWebsites();
  }

  const setStatus = (target: Website, status: 'active' | 'disabled') =>
    run(async () => {
      await updateWebsite(projectId, target.id, { status });
      setMessage(
        `Website ${target.name} ${status === 'active' ? 'enabled' : 'disabled'} and audit recorded.`
      );
      await scope.refreshWebsites();
    });

  const remove = (target: Website) =>
    run(async () => {
      await deleteWebsite(projectId, target.id);
      setMessage(
        `Website ${target.name} deleted. Its data will be permanently removed within a day.`
      );
      await scope.refreshWebsites();
    });

  return (
    <div className="page websites-page" data-page="websites">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Manage{project ? ` · ${project.name}` : ''}</p>
          <h1>Websites</h1>
          <p>Add and configure the websites that send analytics to this project.</p>
        </div>
      </div>
      {scope.activeProjects.length === 0 ? (
        <NoProject />
      ) : (
        <div className="website-layout">
          <div>
            <section className="panel" aria-labelledby="website-list-heading">
              <h2 id="website-list-heading">Websites in this project</h2>
              <WebsiteList
                websites={scope.websites}
                selectedId={website?.id ?? ''}
                onSelect={(item) => scope.selectWebsite(item.id)}
              />
            </section>
            <section className="panel add-website" aria-labelledby="add-website-heading">
              <h2 id="add-website-heading">Add a website</h2>
              <WebsiteForm projects={scope.activeProjects} onSubmit={addWebsite} />
            </section>
          </div>
          <div className="details">
            {website ? (
              <>
                <section className="detail-card" aria-labelledby="website-detail-heading">
                  <div className="card-heading">
                    <div>
                      <p className="eyebrow">Selected website</p>
                      <h2 id="website-detail-heading">{website.name}</h2>
                    </div>
                    <span className={`status ${website.status}`}>{website.status}</span>
                  </div>
                  <p>{website.allowedOrigins.join(', ')}</p>
                  <p className="hint">
                    <a href={hrefFor('manage/installation')}>Installation steps</a> ·{' '}
                    <a href={hrefFor('manage/health')}>Health checks</a>
                  </p>
                  {website.status === 'disabled' && (
                    <div className="actions">
                      <ActionButton
                        capability="toggle-website"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void setStatus(website, 'active')}
                      >
                        Enable website
                      </ActionButton>
                    </div>
                  )}
                </section>
                <section className="detail-card" aria-labelledby="edit-website-heading">
                  <h2 id="edit-website-heading">Edit website</h2>
                  <WebsiteForm
                    key={website.id}
                    initialName={website.name}
                    initialOrigins={website.allowedOrigins}
                    submitLabel="Save changes"
                    onSubmit={(input) => run(() => editWebsite(input))}
                  />
                </section>
                <DangerZone
                  target={website.name}
                  description="Disabling stops collection but keeps history. Deleting removes the website and its data."
                >
                  {website.status === 'active' && (
                    <ActionButton
                      capability="toggle-website"
                      className="secondary"
                      disabled={busy}
                      onClick={() => setPending({ kind: 'disable', website })}
                    >
                      Disable website…
                    </ActionButton>
                  )}
                  <ActionButton
                    capability="delete-website"
                    className="danger"
                    disabled={busy}
                    onClick={() => setPending({ kind: 'delete', website })}
                  >
                    Delete website…
                  </ActionButton>
                </DangerZone>
              </>
            ) : (
              <div className="empty-list">
                Select a website from the list to edit, disable, or delete it.
              </div>
            )}
          </div>
        </div>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {pending?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete ${pending.website.name}?`}
          confirmLabel="Delete website"
          busy={busy}
          onConfirm={() => void remove(pending.website)}
          onCancel={() => setPending(undefined)}
        >
          <p>
            This deletes <strong>{pending.website.name}</strong> and is permanent: its data,
            analytics and audit entries are removed within a day.
          </p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'disable' && (
        <ConfirmDialog
          title={`Disable ${pending.website.name}?`}
          confirmLabel="Disable website"
          busy={busy}
          onConfirm={() => void setStatus(pending.website, 'disabled')}
          onCancel={() => setPending(undefined)}
        >
          <p>
            <strong>{pending.website.name}</strong> will stop collecting new events. Its history
            stays available, and you can enable it again at any time.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
