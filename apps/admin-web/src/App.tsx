import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  bootstrapSession,
  getSetupState,
  listEnvironments,
  listProjects,
  recheckEnvironments,
  type EnvironmentsList,
  type Project,
  type SetupState
} from './api/local-operations.js';
import { AccessState } from './components/AccessState.js';
import { AppFooter } from './components/AppFooter.js';
import { BrandLogo } from './components/BrandLogo.js';
import { ConnectionNotice } from './components/ConnectionNotice.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { ActionsPage } from './analytics/ActionsPage.js';
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
import { InstallPage } from './manage/InstallPage.js';
import { ProjectsPage } from './manage/ProjectsPage.js';
import { WebsiteAddPage } from './manage/WebsiteAddPage.js';
import { WebsiteEditPage } from './manage/WebsiteEditPage.js';
import { WebsitePage } from './manage/WebsitePage.js';
import { WebsitesPage } from './manage/WebsitesPage.js';
import {
  hrefFor,
  navigate,
  routeArea,
  scopeControls,
  showsRange,
  useRoute,
  type Route
} from './router.js';
import { ScopeProvider } from './scope/ScopeProvider.js';
import { AreaNav } from './shell/AreaNav.js';
import { FlashProvider } from './shell/FlashProvider.js';
import { ScopeBar } from './shell/ScopeBar.js';
import { ScopeSwitcher } from './shell/ScopeSwitcher.js';
import { AccessPage } from './manage/AccessPage.js';
import { Journey } from './setup/Journey.js';
import { Welcome } from './setup/Welcome.js';
import { SetupProvider, useSetup } from './setup/SetupProvider.js';
import { useTheme } from './theme.js';

/** Only the admin may use this screen; anyone else is sent home with a notice. */
function AccessGate() {
  const { state } = useSetup();
  if (state && state.principal?.role !== 'admin') {
    useEffect(() => {
      navigate('analytics/overview');
    }, []);
    return (
      <p className="notice" role="status">
        Only an admin can manage access keys.
      </p>
    );
  }
  return <AccessPage />;
}

function AnalyticsRoute({ route }: { route: Route }) {
  switch (route.path) {
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

function ManageRoute({ route }: { route: Route }) {
  const websiteId = route.websiteId ?? '';
  switch (route.path) {
    case 'manage/websites':
      return <WebsitesPage />;
    case 'manage/websites/new':
      return <WebsiteAddPage />;
    case 'manage/websites/:id':
      return <WebsitePage websiteId={websiteId} />;
    case 'manage/websites/:id/edit':
      return <WebsiteEditPage websiteId={websiteId} />;
    case 'manage/websites/:id/install':
      return <InstallPage websiteId={websiteId} />;
    case 'manage/health':
      return <HealthPage />;
    case 'manage/backend':
      // The backend's versions are the first section of Health; the old address still works.
      return <HealthPage />;
    case 'manage/access':
      return <AccessGate />;
    default:
      return <ProjectsPage />;
  }
}

/** Shown on every screen when the backend cannot be reached, so stale results are never mistaken for live ones. */
function BackendNotice() {
  const { state, refresh } = useSetup();
  if (!state || state.connection.status !== 'unreachable') return null;
  return (
    <p className="notice error backend-notice" role="alert">
      The backend is not answering. Your websites keep collecting; results will return when it does.{' '}
      <button className="link-button" type="button" onClick={() => void refresh()}>
        Try again
      </button>{' '}
      Check it with <code>vizoalica env check</code>.
    </p>
  );
}

function Console({ route }: { route: Route }) {
  const area = routeArea(route.path);
  const controls = scopeControls(route.path);
  return (
    <FlashProvider routeKey={`${route.path}|${route.websiteId ?? ''}`}>
      <div className="workspace">
        <aside className="sidebar">
          <AreaNav route={route} />
        </aside>
        <div className="content-column">
          <ScopeBar
            showWebsite={controls === 'project-website'}
            showRange={showsRange(route.path)}
          />
          <ConnectionNotice />
          <BackendNotice />
          <Journey />
          <main id="main" tabIndex={-1} data-area={area} data-route={route.path}>
            {route.path === 'analytics/actions' ? (
              // Its own data: it never needs the overview, so it does not fetch it.
              <ActionsPage />
            ) : area === 'analytics' ? (
              <AnalyticsProvider comparePrevious={route.path === 'analytics/overview'}>
                <AnalyticsRoute route={route} />
              </AnalyticsProvider>
            ) : (
              <ManageRoute route={route} />
            )}
          </main>
          <AppFooter />
        </div>
      </div>
    </FlashProvider>
  );
}

export function App() {
  const [initialProjects, setInitialProjects] = useState<Project[]>([]);
  const [session, setSession] = useState(0);
  const [setupState, setSetupState] = useState<SetupState | undefined>();
  const [environments, setEnvironments] = useState<EnvironmentsList | undefined>();
  const [rechecking, setRechecking] = useState(false);
  const [access, setAccess] = useState<'loading' | 'ready' | 'denied' | 'offline' | 'welcome'>(
    'loading'
  );
  const [denialReason, setDenialReason] = useState<
    'session_expired' | 'worker_authorization' | undefined
  >();
  const route = useRoute();
  // The project the console is on, kept in memory so an environment switch can keep it even when
  // browser storage is blocked.
  const lastProjectId = useRef('');
  const [sessionStarted, setSessionStarted] = useState(false);
  const theme = useTheme(sessionStarted);
  const connect = useCallback(async () => {
    setAccess('loading');
    setDenialReason(undefined);
    try {
      await bootstrapSession();
      setSessionStarted(true);
      const list = await listEnvironments();
      setEnvironments(list);
      if (!list.selected) {
        setSetupState(undefined);
        setAccess('welcome');
        return;
      }
      // A console that cannot ask how far along it is carries on as before rather than blocking.
      const state = await getSetupState().catch(() => undefined);
      setSetupState(state);
      if (state?.connection.status === 'revoked') {
        setDenialReason('worker_authorization');
        setAccess('denied');
        return;
      }
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
  const recheck = useCallback(async () => {
    setRechecking(true);
    try {
      await recheckEnvironments();
    } finally {
      setRechecking(false);
    }
    await connect();
  }, [connect]);
  const toggle = (
    <ThemeToggle
      theme={theme.theme}
      saving={theme.saving}
      saveError={theme.saveError}
      onChange={theme.setTheme}
    />
  );
  const brand = (
    <a className="brand" href={hrefFor('analytics/overview')} aria-label="Vizoalica overview">
      <BrandLogo theme={theme.theme} />
    </a>
  );
  if (access === 'ready')
    return (
      <div className="app-shell">
        <SetupProvider key={session} initial={setupState}>
          <ScopeProvider
            key={session}
            initialProjects={initialProjects}
            preferredProjectId={lastProjectId.current}
            onProjectChange={(id) => (lastProjectId.current = id)}
          >
            <header className="topbar">
              {brand}
              <div className="topbar-actions">
                <ScopeSwitcher
                  list={environments}
                  route={route}
                  onEnvironmentChanged={() => void connect()}
                />
                {toggle}
              </div>
            </header>
            <Console route={route} />
          </ScopeProvider>
        </SetupProvider>
      </div>
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        {brand}
        <div className="topbar-actions">{toggle}</div>
      </header>
      <div className="workspace workspace-single">
        <div className="content-column">
          <main id="main" tabIndex={-1}>
            {access === 'welcome' ? (
              <Welcome list={environments} checking={rechecking} onRecheck={() => void recheck()} />
            ) : (
              <AccessState state={access} reason={denialReason} onRetry={() => void connect()} />
            )}
          </main>
          <AppFooter />
        </div>
      </div>
    </div>
  );
}
