import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  bootstrapSession,
  getSetupState,
  listProjects,
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
import { AccessPage } from './manage/AccessPage.js';
import { BackendPage } from './manage/BackendPage.js';
import { EnvironmentSwitcher } from './setup/EnvironmentSwitcher.js';
import { FirstRun } from './setup/FirstRun.js';
import { Journey } from './setup/Journey.js';
import { SetupPage } from './setup/SetupPage.js';
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

function ManageRoute({ route, onReconnect }: { route: Route; onReconnect: () => void }) {
  const websiteId = route.websiteId ?? '';
  switch (route.path) {
    case 'setup':
      return <SetupPage onChanged={onReconnect} />;
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
      return <BackendPage onDeployed={onReconnect} />;
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
      <a href="#/setup">Check the connection</a>
    </p>
  );
}

function Console({ route, onReconnect }: { route: Route; onReconnect: () => void }) {
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
            showProject={controls !== 'none'}
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
              <ManageRoute route={route} onReconnect={onReconnect} />
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
  const [access, setAccess] = useState<
    'loading' | 'ready' | 'denied' | 'offline' | 'first-run' | 'setup'
  >('loading');
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
      // A console that cannot ask how far along it is carries on as before rather than blocking.
      const state = await getSetupState().catch(() => undefined);
      setSetupState(state);
      if (state?.needsFirstRun) {
        setAccess('first-run');
        return;
      }
      if (state?.connection.status === 'incompatible') {
        setAccess('setup');
        return;
      }
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
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={hrefFor('analytics/overview')} aria-label="Vizoalica overview">
          <BrandLogo theme={theme.theme} />
        </a>
        <div className="topbar-actions">
          <EnvironmentSwitcher
            role={setupState?.principal?.role}
            onChanged={() => void connect()}
          />
          <ThemeToggle
            theme={theme.theme}
            saving={theme.saving}
            saveError={theme.saveError}
            onChange={theme.setTheme}
          />
        </div>
      </header>
      {access === 'ready' ? (
        <SetupProvider key={session} initial={setupState}>
          <ScopeProvider key={session} initialProjects={initialProjects}>
            <Console route={route} onReconnect={() => void connect()} />
          </ScopeProvider>
        </SetupProvider>
      ) : (
        <div className="workspace workspace-single">
          <div className="content-column">
            <main id="main" tabIndex={-1}>
              {access === 'first-run' ? (
                <FirstRun legacySetup={setupState?.legacySetup} onDone={() => void connect()} />
              ) : access === 'setup' ? (
                <SetupProvider key={session} initial={setupState}>
                  <SetupPage onChanged={() => void connect()} />
                </SetupProvider>
              ) : (
                <>
                  <AccessState
                    state={access}
                    reason={denialReason}
                    onRetry={() => void connect()}
                  />
                  {setupState && access !== 'loading' && (
                    <SetupProvider initial={setupState}>
                      <SetupPage onChanged={() => void connect()} />
                    </SetupProvider>
                  )}
                </>
              )}
            </main>
            <AppFooter />
          </div>
        </div>
      )}
    </div>
  );
}
