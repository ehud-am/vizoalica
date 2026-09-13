import { useCallback, useEffect, useState } from 'react';
import { ApiError, bootstrapSession, listProjects, type Project } from './api/local-operations.js';
import { AccessState } from './components/AccessState.js';
import { AppFooter } from './components/AppFooter.js';
import { BrandLogo } from './components/BrandLogo.js';
import { AnalyticsIcon, LockIcon, ProjectsIcon, WebsitesIcon } from './components/Icons.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { WorkspaceContextHelp } from './components/WorkspaceContextHelp.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { WebsitesPage } from './pages/WebsitesPage.js';
import { useTheme } from './theme.js';

type View = 'projects' | 'overview' | 'websites';

function reconciledProjectId(current: string, projects: Project[], preferred?: string): string {
  if (preferred && projects.some((project) => project.id === preferred)) return preferred;
  if (current && projects.some((project) => project.id === current)) return current;
  return projects[0]?.id ?? '';
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [view, setView] = useState<View>('overview');
  const [access, setAccess] = useState<'loading' | 'ready' | 'denied' | 'offline'>('loading');
  const [denialReason, setDenialReason] = useState<
    'session_expired' | 'worker_authorization' | undefined
  >();
  const theme = useTheme();
  const updateProjects = useCallback((next: Project[], preferredProjectId?: string) => {
    setProjects(next);
    setProjectId((current) => reconciledProjectId(current, next, preferredProjectId));
  }, []);
  const connect = useCallback(async () => {
    setAccess('loading');
    setDenialReason(undefined);
    try {
      await bootstrapSession();
      const next = await listProjects();
      updateProjects(next);
      setAccess('ready');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        setDenialReason(
          error.code === 'session_expired' ? 'session_expired' : 'worker_authorization'
        );
      setAccess(error instanceof ApiError && error.status === 401 ? 'denied' : 'offline');
    }
  }, [updateProjects]);
  useEffect(() => void connect(), [connect]);
  const openProjectView = useCallback((id: string, nextView: Exclude<View, 'projects'>) => {
    setProjectId(id);
    setView(nextView);
  }, []);
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
          <WorkspaceContextHelp />
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <p className="eyebrow">Workspace</p>
          <nav aria-label="Primary navigation">
            <button
              className={view === 'projects' ? 'nav-item active' : 'nav-item'}
              onClick={() => setView('projects')}
              aria-current={view === 'projects' ? 'page' : undefined}
            >
              <ProjectsIcon size={20} />
              Projects
            </button>
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
        <div className="content-column">
          <main id="main" tabIndex={-1} data-view={view}>
            {access !== 'ready' ? (
              <AccessState state={access} reason={denialReason} onRetry={() => void connect()} />
            ) : view === 'projects' ? (
              <ProjectsPage
                projects={projects}
                projectId={projectId}
                onProjectSelect={setProjectId}
                onProjectsChange={updateProjects}
                onOpenOverview={(id) => openProjectView(id, 'overview')}
                onOpenWebsites={(id) => openProjectView(id, 'websites')}
              />
            ) : view === 'overview' ? (
              <AnalyticsPage
                key={`analytics:${projectId}`}
                projects={projects}
                projectId={projectId}
                onProjectChange={setProjectId}
              />
            ) : (
              <WebsitesPage
                projects={projects}
                projectId={projectId}
                onProjectChange={setProjectId}
                onOpenProjects={() => setView('projects')}
              />
            )}
          </main>
          <AppFooter />
        </div>
      </div>
    </div>
  );
}
