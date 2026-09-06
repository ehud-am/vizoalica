import { useCallback, useEffect, useState } from 'react';
import { ApiError, bootstrapSession, listProjects, type Project } from './api/local-operations.js';
import { AccessState } from './components/AccessState.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { WebsitesPage } from './pages/WebsitesPage.js';

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [view, setView] = useState<'overview' | 'websites'>('overview');
  const [access, setAccess] = useState<'loading' | 'ready' | 'denied' | 'offline'>('loading');
  const connect = useCallback(async () => {
    setAccess('loading');
    try {
      await bootstrapSession();
      const next = await listProjects();
      setProjects(next);
      setProjectId((current) => current || next[0]?.id || '');
      setAccess('ready');
    } catch (error) {
      setAccess(error instanceof ApiError && error.status === 401 ? 'denied' : 'offline');
    }
  }, []);
  useEffect(() => void connect(), [connect]);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="Vizoalica home">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <span>Vizoalica</span>
        </a>
        <div className="local-pill">
          <span aria-hidden="true" /> Local workspace
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar" aria-label="Primary navigation">
          <p className="eyebrow">Workspace</p>
          <nav>
            <button
              className={view === 'overview' ? 'nav-item active' : 'nav-item'}
              onClick={() => setView('overview')}
              aria-current={view === 'overview' ? 'page' : undefined}
            >
              Overview
            </button>
            <button
              className={view === 'websites' ? 'nav-item active' : 'nav-item'}
              onClick={() => setView('websites')}
              aria-current={view === 'websites' ? 'page' : undefined}
            >
              Websites
            </button>
          </nav>
          <div className="privacy-note">
            <strong>Private by design</strong>
            <span>Credentials stay on this machine.</span>
          </div>
        </aside>
        <main id="main" tabIndex={-1}>
          {access !== 'ready' ? (
            <AccessState state={access} onRetry={() => void connect()} />
          ) : view === 'overview' ? (
            <AnalyticsPage
              projects={projects}
              projectId={projectId}
              onProjectChange={setProjectId}
            />
          ) : (
            <WebsitesPage
              projects={projects}
              projectId={projectId}
              onProjectChange={setProjectId}
              onProjectsChange={setProjects}
            />
          )}
        </main>
      </div>
    </div>
  );
}
