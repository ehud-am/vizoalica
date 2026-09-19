import { useCallback, useEffect, useState } from 'react';
import { ApiError, bootstrapSession, listProjects, type Project } from './api/local-operations.js';
import { AccessState } from './components/AccessState.js';
import { AppFooter } from './components/AppFooter.js';
import { BrandLogo } from './components/BrandLogo.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { WorkspaceContextHelp } from './components/WorkspaceContextHelp.js';
import { AnalyticsProvider } from './analytics/AnalyticsProvider.js';
import { GeographyPage } from './analytics/GeographyPage.js';
import {
  PagesPage,
  SourcesPage,
  TechnologyPage,
  TrafficQualityPage
} from './analytics/ListPages.js';
import { OverviewPage } from './analytics/OverviewPage.js';
import { HealthPage } from './manage/HealthPage.js';
import { InstallationPage } from './manage/InstallationPage.js';
import { ProjectsPage } from './manage/ProjectsPage.js';
import { WebsitesPage } from './manage/WebsitesPage.js';
import { hrefFor, routeArea, useRoute, type RoutePath } from './router.js';
import { ScopeProvider } from './scope/ScopeProvider.js';
import { AreaNav } from './shell/AreaNav.js';
import { ScopeBar } from './shell/ScopeBar.js';
import { useTheme } from './theme.js';

function AnalyticsRoute({ route }: { route: RoutePath }) {
  switch (route) {
    case 'analytics/pages':
      return <PagesPage />;
    case 'analytics/sources':
      return <SourcesPage />;
    case 'analytics/geography':
      return <GeographyPage />;
    case 'analytics/technology':
      return <TechnologyPage />;
    case 'analytics/traffic-quality':
      return <TrafficQualityPage />;
    default:
      return <OverviewPage />;
  }
}

function ManageRoute({ route }: { route: RoutePath }) {
  switch (route) {
    case 'manage/websites':
      return <WebsitesPage />;
    case 'manage/installation':
      return <InstallationPage />;
    case 'manage/health':
      return <HealthPage />;
    default:
      return <ProjectsPage />;
  }
}

function Console({ route }: { route: RoutePath }) {
  const area = routeArea(route);
  return (
    <div className="workspace">
      <aside className="sidebar">
        <AreaNav route={route} />
      </aside>
      <div className="content-column">
        <ScopeBar showProject={route !== 'manage/projects'} showRange={area === 'analytics'} />
        <main id="main" tabIndex={-1} data-area={area} data-route={route}>
          {area === 'analytics' ? (
            <AnalyticsProvider>
              <AnalyticsRoute route={route} />
            </AnalyticsProvider>
          ) : (
            <ManageRoute route={route} />
          )}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}

export function App() {
  const [initialProjects, setInitialProjects] = useState<Project[]>([]);
  const [session, setSession] = useState(0);
  const [access, setAccess] = useState<'loading' | 'ready' | 'denied' | 'offline'>('loading');
  const [denialReason, setDenialReason] = useState<
    'session_expired' | 'worker_authorization' | undefined
  >();
  const route = useRoute();
  const theme = useTheme();
  const connect = useCallback(async () => {
    setAccess('loading');
    setDenialReason(undefined);
    try {
      await bootstrapSession();
      setInitialProjects(await listProjects());
      setSession((value) => value + 1);
      setAccess('ready');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        setDenialReason(
          error.code === 'session_expired' ? 'session_expired' : 'worker_authorization'
        );
      setAccess(error instanceof ApiError && error.status === 401 ? 'denied' : 'offline');
    }
  }, []);
  useEffect(() => void connect(), [connect]);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={hrefFor('analytics/overview')} aria-label="Vizoalica overview">
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
      {access === 'ready' ? (
        <ScopeProvider key={session} initialProjects={initialProjects}>
          <Console route={route} />
        </ScopeProvider>
      ) : (
        <div className="workspace workspace-single">
          <div className="content-column">
            <main id="main" tabIndex={-1}>
              <AccessState state={access} reason={denialReason} onRetry={() => void connect()} />
            </main>
            <AppFooter />
          </div>
        </div>
      )}
    </div>
  );
}
