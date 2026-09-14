import { useState, type FormEvent } from 'react';
import {
  createProject,
  deleteProject,
  listProjects,
  type Project
} from '../api/local-operations.js';
import { AnalyticsIcon, PlusIcon, RefreshIcon, WebsitesIcon } from '../components/Icons.js';

export function ProjectsPage({
  projects,
  projectId,
  onProjectSelect,
  onProjectsChange,
  onOpenOverview,
  onOpenWebsites
}: {
  projects: Project[];
  projectId: string;
  onProjectSelect: (id: string) => void;
  onProjectsChange: (projects: Project[], preferredProjectId?: string) => void;
  onOpenOverview: (id: string) => void;
  onOpenWebsites: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh(preferredProjectId?: string) {
    const next = await listProjects();
    onProjectsChange(next, preferredProjectId);
    return next;
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

  async function removeProject(project: Project) {
    if (
      !window.confirm(
        `Soft-delete project ${project.name} and all its websites? Historic analytics and audit evidence will be kept.`
      )
    )
      return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await deleteProject(project.id);
      await refresh();
      setMessage(
        `Project ${project.name} deleted. Historic analytics and audit evidence were preserved.`
      );
    } catch {
      setError('The project could not be deleted. Check the current project list and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page projects-page" data-page="projects">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace structure</p>
          <h1>Projects</h1>
          <p>Choose the ownership boundary for websites and analytics.</p>
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
          <button className="primary" type="submit" disabled={busy || !name.trim()}>
            <PlusIcon size={16} />
            {busy ? 'Saving…' : 'Create project'}
          </button>
        </form>
      </section>

      {projects.length ? (
        <ul className="project-list" aria-label="Available projects">
          {projects.map((project) => {
            const selected = project.id === projectId;
            const deleted = project.status === 'deleted';
            const identity = `${project.name} (${project.id})`;
            return (
              <li key={project.id}>
                <article className={selected ? 'project-card selected' : 'project-card'}>
                  <div className="project-card-heading">
                    <div>
                      <h2>{project.name}</h2>
                      <code>{project.id}</code>
                    </div>
                    {deleted ? (
                      <span className="status deleted">Deleted</span>
                    ) : (
                      selected && <span className="status">Current project</span>
                    )}
                  </div>
                  <p>
                    {project.websiteCount === undefined
                      ? 'Website count unavailable'
                      : `${project.websiteCount} ${project.websiteCount === 1 ? 'website' : 'websites'}`}
                  </p>
                  <div className="project-actions">
                    <button
                      className="secondary"
                      type="button"
                      aria-label={`Select ${identity}`}
                      aria-pressed={selected}
                      disabled={deleted}
                      onClick={() => onProjectSelect(project.id)}
                    >
                      {selected ? 'Selected' : 'Select project'}
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      aria-label={`Open analytics for ${identity}`}
                      disabled={deleted}
                      onClick={() => onOpenOverview(project.id)}
                    >
                      <AnalyticsIcon size={16} />
                      Analytics
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      aria-label={`Open websites for ${identity}`}
                      disabled={deleted}
                      onClick={() => onOpenWebsites(project.id)}
                    >
                      <WebsitesIcon size={16} />
                      Websites
                    </button>
                    <button
                      className="danger"
                      type="button"
                      aria-label={`Delete ${identity}`}
                      disabled={busy || deleted}
                      onClick={() => void removeProject(project)}
                    >
                      Delete project
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty-list project-empty">
          <strong>No projects yet</strong>
          <span>Create a project before organizing websites or viewing analytics.</span>
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
    </div>
  );
}
