import { useState, type FormEvent } from 'react';
import {
  createProject,
  deleteProject,
  listProjects,
  type Project
} from '../api/local-operations.js';
import { ActionButton } from '../components/ActionButton.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { PlusIcon, RefreshIcon } from '../components/Icons.js';
import { hrefFor } from '../router.js';
import { useScope } from '../scope/ScopeProvider.js';
import { DangerZone } from './DangerZone.js';

export function ProjectsPage() {
  const scope = useScope();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Project>();
  const active = scope.projects.filter((project) => project.status !== 'deleted');
  const deleted = scope.projects.filter((project) => project.status === 'deleted');

  async function refresh(preferredProjectId?: string) {
    scope.setProjects(await listProjects(), preferredProjectId);
  }

  async function refreshProjects() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await refresh();
      setMessage('Project list refreshed.');
    } catch {
      setError('Projects could not be refreshed. Existing project information is unchanged.');
    } finally {
      setBusy(false);
    }
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectName = name.trim();
    if (!projectName) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const created = await createProject(projectName);
      await refresh(created.id);
      setName('');
      setMessage(`Project ${created.name} created.`);
    } catch {
      setError('The project could not be created. Check the current project list and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const project = pendingDelete;
    if (!project) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await deleteProject(project.id);
      await refresh();
      setMessage(
        `Project ${project.name} deleted. Its data will be permanently removed within a day.`
      );
    } catch {
      setError('The project could not be deleted. Check the current project list and try again.');
    } finally {
      setPendingDelete(undefined);
      setBusy(false);
    }
  }

  return (
    <div className="page projects-page" data-page="projects">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Manage</p>
          <h1>Projects</h1>
          <p>Projects are the ownership boundary for websites and analytics.</p>
        </div>
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => void refreshProjects()}
        >
          <RefreshIcon size={16} />
          Refresh projects
        </button>
      </div>

      <section className="panel project-create-panel" aria-labelledby="create-project-heading">
        <div>
          <h2 id="create-project-heading">Create a project</h2>
          <p>Projects keep each group of websites and analytics isolated.</p>
        </div>
        <form className="project-create-form" onSubmit={(event) => void addProject(event)}>
          <label>
            Project name
            <input
              value={name}
              required
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <ActionButton
            capability="create-project"
            className="primary"
            type="submit"
            disabled={busy || !name.trim()}
          >
            <PlusIcon size={16} />
            {busy ? 'Saving…' : 'Create project'}
          </ActionButton>
        </form>
      </section>

      {active.length ? (
        <ul className="project-list" aria-label="Projects">
          {active.map((project) => (
            <li key={project.id}>
              <article className="project-card">
                <div className="project-card-heading">
                  <div>
                    <h2>{project.name}</h2>
                    <code>{project.id}</code>
                  </div>
                </div>
                <p>
                  {project.websiteCount === undefined
                    ? 'Website count unavailable'
                    : `${project.websiteCount} ${project.websiteCount === 1 ? 'website' : 'websites'}`}
                </p>
                <div className="project-actions">
                  <a
                    className="secondary button-link"
                    href={hrefFor('manage/websites')}
                    aria-label={`Manage websites in ${project.name} (${project.id})`}
                    onClick={() => scope.selectProject(project.id)}
                  >
                    Manage websites
                  </a>
                  <a
                    className="secondary button-link"
                    href={hrefFor('analytics/overview')}
                    aria-label={`View analytics for ${project.name} (${project.id})`}
                    onClick={() => scope.selectProject(project.id)}
                  >
                    View analytics
                  </a>
                </div>
                <DangerZone
                  target={project.name}
                  description="Deleting a project removes all of its websites, data, and analytics."
                >
                  <ActionButton
                    capability="delete-project"
                    className="danger"
                    disabled={busy}
                    aria-label={`Delete project ${project.name} (${project.id})`}
                    onClick={() => setPendingDelete(project)}
                  >
                    Delete project…
                  </ActionButton>
                </DangerZone>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-list project-empty">
          <strong>No projects yet</strong>
          <span>Create a project before adding websites or viewing analytics.</span>
        </div>
      )}

      {deleted.length > 0 && (
        <details className="deleted-projects">
          <summary>Deleted projects ({deleted.length})</summary>
          <ul>
            {deleted.map((project) => (
              <li key={project.id}>
                {project.name} <code>{project.id}</code>
              </li>
            ))}
          </ul>
        </details>
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

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete project ${pendingDelete.name}?`}
          confirmLabel="Delete project"
          requireText={pendingDelete.name}
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(undefined)}
        >
          <p>
            This deletes <strong>{pendingDelete.name}</strong> ({pendingDelete.id}) and all of its
            websites. It is permanent: their data, analytics and audit entries are removed within a
            day.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
