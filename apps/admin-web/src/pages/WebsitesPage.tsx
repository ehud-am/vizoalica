import { useEffect, useState } from 'react';
import {
  ApiError,
  createWebsite,
  deleteWebsite,
  getSnippet,
  getStatus,
  listWebsites,
  updateWebsite,
  type Integration,
  type Project,
  type Status,
  type Website
} from '../api/local-operations.js';
import { IntegrationSnippet } from '../components/IntegrationSnippet.js';
import { OperationalStatus } from '../components/OperationalStatus.js';
import { WebsiteForm } from '../components/WebsiteForm.js';
import { WebsiteList } from '../components/WebsiteList.js';
export function WebsitesPage({
  projects,
  projectId,
  onProjectChange,
  onOpenProjects
}: {
  projects: Project[];
  projectId: string;
  onProjectChange: (id: string) => void;
  onOpenProjects: () => void;
}) {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [selected, setSelected] = useState<Website>();
  const [snippet, setSnippet] = useState<Integration>();
  const [status, setStatus] = useState<Status>();
  const [message, setMessage] = useState('');
  async function safely(action: () => Promise<void>) {
    try {
      setMessage('');
      await action();
    } catch {
      setMessage(
        'The operation was interrupted. Check the current status, then retry safely if needed.'
      );
    }
  }
  async function refresh(targetProjectId = projectId) {
    if (!targetProjectId) return;
    const items = await listWebsites(targetProjectId);
    setWebsites(items);
    setSelected((current) => items.find((item) => item.id === current?.id) ?? items[0]);
  }
  useEffect(() => {
    void refresh();
  }, [projectId]);
  useEffect(() => {
    setSnippet(undefined);
    setStatus(undefined);
    if (!selected || !projectId) return;
    Promise.all([getSnippet(projectId, selected.id), getStatus(projectId, selected.id)])
      .then(([nextSnippet, nextStatus]) => {
        setSnippet(nextSnippet);
        setStatus(nextStatus);
      })
      .catch(() => setMessage('Details are temporarily unavailable. Try again safely.'));
  }, [projectId, selected?.id]);
  async function addWebsite(input: { projectId?: string; name: string; allowedOrigins: string[] }) {
    const targetProjectId = input.projectId;
    const project = projects.find((item) => item.id === targetProjectId);
    if (!targetProjectId || !project) {
      setMessage('The selected project is no longer available. Refresh Projects and try again.');
      throw new Error('project_unavailable');
    }
    try {
      const created = await createWebsite(targetProjectId, {
        name: input.name,
        allowedOrigins: input.allowedOrigins
      });
      await refresh(targetProjectId);
      setMessage(`Website ${created.name} created in project ${project.name} (${project.id}).`);
      onProjectChange(targetProjectId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        setMessage('The selected project is no longer available. Your entries were preserved.');
      else setMessage('Website creation was interrupted. Your entries were preserved.');
      throw error;
    }
  }
  async function editWebsite(input: { name: string; allowedOrigins: string[] }) {
    if (!selected) return;
    await updateWebsite(projectId, selected.id, input);
    setMessage('Website updated and audit recorded.');
    await refresh();
  }
  async function toggle() {
    if (!selected) return;
    await updateWebsite(projectId, selected.id, {
      status: selected.status === 'active' ? 'disabled' : 'active'
    });
    setMessage(
      `Website ${selected.status === 'active' ? 'disabled' : 'enabled'} and audit recorded.`
    );
    await refresh();
  }
  async function remove() {
    if (
      !selected ||
      !window.confirm(
        `Soft-delete ${selected.name}? Historic analytics and audit evidence will be kept.`
      )
    )
      return;
    await deleteWebsite(projectId, selected.id);
    setMessage('Website deleted. Historic analytics and audit evidence were preserved.');
    await refresh();
  }
  return (
    <div className="page websites-page" data-page="websites">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Websites</h1>
          <p>Manage collection boundaries without exposing administrator credentials.</p>
        </div>
      </div>
      <section className="panel">
        {projects.length === 0 ? (
          <div className="empty-list project-empty">
            <strong>Create a project first</strong>
            <span>Every website must belong to an explicit project.</span>
            <button className="primary" type="button" onClick={onOpenProjects}>
              Go to Projects
            </button>
          </div>
        ) : (
          <>
            <div className="selector-row">
              <label>
                Browsing project
                <select value={projectId} onChange={(event) => onProjectChange(event.target.value)}>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="website-layout">
              <div>
                <WebsiteList
                  websites={websites}
                  selectedId={selected?.id ?? ''}
                  onSelect={setSelected}
                />
                <details className="add-site">
                  <summary>Add a website</summary>
                  <WebsiteForm projects={projects} onSubmit={addWebsite} />
                </details>
              </div>
              <div className="details">
                {selected ? (
                  <>
                    <section className="detail-card">
                      <div className="card-heading">
                        <div>
                          <p className="eyebrow">Selected website</p>
                          <h2>{selected.name}</h2>
                        </div>
                        <span className={`status ${selected.status}`}>{selected.status}</span>
                      </div>
                      <p>{selected.allowedOrigins.join(', ')}</p>
                      {selected.status !== 'deleted' && (
                        <details className="add-site">
                          <summary>Edit website</summary>
                          <WebsiteForm
                            key={selected.id}
                            initialName={selected.name}
                            initialOrigins={selected.allowedOrigins}
                            submitLabel="Save changes"
                            onSubmit={(input) => safely(() => editWebsite(input))}
                          />
                        </details>
                      )}
                      <div className="actions">
                        <button
                          className="secondary"
                          disabled={selected.status === 'deleted'}
                          onClick={() => void safely(toggle)}
                        >
                          {selected.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="danger"
                          disabled={selected.status === 'deleted'}
                          onClick={() => void safely(remove)}
                        >
                          Soft delete
                        </button>
                      </div>
                    </section>
                    {status && <OperationalStatus status={status} />}
                    {snippet && <IntegrationSnippet snippet={snippet} />}
                  </>
                ) : (
                  <div className="empty-list">Select a website to inspect it.</div>
                )}
              </div>
            </div>
          </>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
