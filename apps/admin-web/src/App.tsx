import { useCallback, useEffect, useState } from 'react';
import { ApiError, bootstrapSession, listProjects, type Project } from './api/local-operations.js';
import { AccessState } from './components/AccessState.js';
import { AppFooter } from './components/AppFooter.js';
import { BrandLogo } from './components/BrandLogo.js';
import { AnalyticsIcon, LockIcon, WebsitesIcon } from './components/Icons.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { WebsitesPage } from './pages/WebsitesPage.js';
import { useTheme } from './theme.js';

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [view, setView] = useState<'overview' | 'websites'>('overview');
  const [access, setAccess] = useState<'loading' | 'ready' | 'denied' | 'offline'>('loading');
  const theme = useTheme();
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
        <a
          className="brand"
          href="#main"
          aria-label="Vizoalica overview"
          onClick={() => setView('overview')}
        >
          <BrandLogo theme={theme.theme} />
        </a>
        <div className="topbar-actions">
          <ThemeToggle
            theme={theme.theme}
            saving={theme.saving}
            saveError={theme.saveError}
            onChange={theme.setTheme}
          />
          <div className="local-pill">
            <span aria-hidden="true" />
            <span className="local-pill-label">Local workspace</span>
          </div>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <p className="eyebrow">Workspace</p>
          <nav aria-label="Primary navigation">
            <button
              className={view === 'overview' ? 'nav-item active' : 'nav-item'}
              onClick={() => setView('overview')}
              aria-current={view === 'overview' ? 'page' : undefined}
            >
              <AnalyticsIcon size={20} />
              Overview
            </button>
            <button
              className={view === 'websites' ? 'nav-item active' : 'nav-item'}
              onClick={() => setView('websites')}
              aria-current={view === 'websites' ? 'page' : undefined}
            >
              <WebsitesIcon size={20} />
              Websites
            </button>
          </nav>
          <div className="privacy-note">
            <LockIcon size={20} />
            <strong>Private by design</strong>
            <span>Credentials stay on this machine.</span>
          </div>
        </aside>
        <main id="main" tabIndex={-1} data-view={view}>
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
          {access === 'ready' && <AppFooter />}
        </main>
      </div>
    </div>
  );
}
